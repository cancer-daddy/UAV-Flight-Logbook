/* GEO 248 flight logbook: offline local IndexedDB, CSV, print-to-PDF. */
'use strict';
const MODELS = ['DJI Mini 3 Pro', 'DJI Mini 5 Pro', 'Virtual Phantom 4'];
const HEADERS = ['Date', 'Type', 'UAV', 'Duration', 'Location', 'VO', 'Notes'];
const GOAL = 30;
const VIRTUAL_NA = 'N/A - Virtual Flight';
const $ = id => document.getElementById(id);
let db;
let flights = [];
let editingId = null;
let pendingImport = null;

function notify(message, kind = '') {
  const el = $('message'); el.textContent = message;
  el.className = `notice ${kind}`;
}
function hideNotice() { $('message').classList.add('hidden'); }
function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('geo248-uav-flight-logbook', 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore('flights', { keyPath: 'id' });
      store.createIndex('date', 'date');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function transaction(mode, callback) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('flights', mode);
    const store = tx.objectStore('flights');
    let result;
    try { result = callback(store); } catch (error) { reject(error); return; }
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Database transaction aborted'));
  });
}
async function loadFlights() {
  flights = await new Promise((resolve, reject) => {
    const req = db.transaction('flights', 'readonly').objectStore('flights').getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  flights.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  render();
}
function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const values = new Uint8Array(16); crypto.getRandomValues(values);
  return [...values].map(n => n.toString(16).padStart(2, '0')).join('');
}
function formatDate(date) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  return match ? `${match[2]}/${match[3]}/${match[1]}` : date;
}
function parseDate(value) {
  const s = String(value).trim();
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  const iso = m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : s;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new Error('Invalid date: ' + s);
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) {
    throw new Error('Invalid calendar date: ' + s);
  }
  return iso;
}
function validateFlight(record) {
  const date = parseDate(record.date);
  const type = String(record.type).trim();
  const model = String(record.model).trim();
  const duration = Number(record.duration);
  if (!['In-Person', 'Virtual'].includes(type)) throw new Error('Flight type must be In-Person or Virtual.');
  if (!MODELS.includes(model) || (type === 'Virtual') !== (model === 'Virtual Phantom 4')) {
    throw new Error('UAV model does not match the flight type.');
  }
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('Duration must be a positive number.');
  const notes = String(record.notes ?? '').trim();
  if (!notes) throw new Error('Flight notes cannot be blank.');
  let location = String(record.location ?? '').trim();
  let observer = String(record.observer ?? '').trim();
  if (type === 'In-Person' && (!location || !observer)) throw new Error('Location and VO are required for in-person flights.');
  if (type === 'Virtual') { location = VIRTUAL_NA; observer = VIRTUAL_NA; }
  return { id: record.id || uid(), date, type, model, duration, location, observer, notes };
}
function updateModelOptions(preferred) {
  const choices = $('type').value === 'Virtual' ? MODELS.slice(2) : MODELS.slice(0, 2);
  $('model').replaceChildren();
  for (const model of choices) {
    const option = document.createElement('option'); option.value = model; option.textContent = model;
    $('model').append(option);
  }
  if (choices.includes(preferred)) $('model').value = preferred;
  const virtual = $('type').value === 'Virtual';
  $('locationLabel').classList.toggle('hidden', virtual);
  $('observerLabel').classList.toggle('hidden', virtual);
  $('location').required = !virtual;
  $('observer').required = !virtual;
}
function resetForm() {
  editingId = null;
  $('flightForm').reset();
  const today = new Date();
  const localDate = new Date(today.getTime() - today.getTimezoneOffset() * 60000);
  $('date').value = localDate.toISOString().slice(0, 10);
  $('type').value = 'In-Person';
  updateModelOptions();
  $('formTitle').textContent = 'Record a flight';
  $('saveBtn').textContent = 'Save flight';
  $('cancelBtn').classList.add('hidden');
}
async function saveFlight(event) {
  event.preventDefault();
  try {
    const record = validateFlight({
      id: editingId, date: $('date').value, type: $('type').value,
      model: $('model').value, duration: $('duration').value,
      location: $('location').value, observer: $('observer').value,
      notes: $('notes').value
    });
    await transaction('readwrite', store => store.put(record));
    const updated = Boolean(editingId);
    resetForm(); await loadFlights();
    notify(updated ? 'Flight updated and saved on this device.' : 'Flight saved on this device.');
  } catch (error) { notify(error.message, 'error'); }
}
function editFlight(id) {
  const flight = flights.find(f => f.id === id);
  if (!flight) return;
  editingId = id;
  $('date').value = flight.date;
  $('type').value = flight.type;
  updateModelOptions(flight.model);
  $('duration').value = flight.duration;
  $('location').value = flight.location === VIRTUAL_NA ? '' : flight.location;
  $('observer').value = flight.observer === VIRTUAL_NA ? '' : flight.observer;
  $('notes').value = flight.notes;
  $('formTitle').textContent = 'Edit flight';
  $('saveBtn').textContent = 'Update flight';
  $('cancelBtn').classList.remove('hidden');
  $('formPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
async function deleteFlight(id) {
  const flight = flights.find(f => f.id === id);
  if (!flight || !confirm(`Delete the ${formatDate(flight.date)} ${flight.model} flight? This cannot be undone.`)) return;
  try {
    await transaction('readwrite', store => store.delete(id));
    if (editingId === id) resetForm();
    await loadFlights(); notify('Flight deleted.');
  } catch (error) { notify('Unable to delete: ' + error.message, 'error'); }
}
function addText(parent, tag, content, className) {
  const el = document.createElement(tag); el.textContent = content;
  if (className) el.className = className;
  parent.append(el); return el;
}
function render() {
  const total = flights.reduce((sum, f) => sum + f.duration, 0);
  $('sessions').textContent = flights.length;
  $('total').textContent = total.toFixed(1);
  $('average').textContent = (flights.length ? total / flights.length : 0).toFixed(1);
  $('recordCount').textContent = `${flights.length} saved`;
  const progress = $('progress'); progress.replaceChildren();
  for (const model of MODELS) {
    const minutes = flights.filter(f => f.model === model).reduce((sum, f) => sum + f.duration, 0);
    const row = addText(progress, 'div', '', 'progress-row');
    const head = addText(row, 'div', '', 'progress-head');
    addText(head, 'span', model);
    addText(head, 'span', `${minutes.toFixed(1)} / ${GOAL} min${minutes >= GOAL ? ' ✓' : ''}`);
    const track = addText(row, 'div', '', 'track');
    const fill = addText(track, 'div', '', 'fill' + (minutes >= GOAL ? ' complete' : ''));
    fill.style.width = `${Math.min(100, minutes / GOAL * 100)}%`;
  }
  const list = $('records'); list.replaceChildren();
  if (!flights.length) { addText(list, 'div', 'No flights recorded yet.', 'empty'); }
  for (const flight of [...flights].reverse()) {
    const card = addText(list, 'article', '', 'flight');
    const top = addText(card, 'div', '', 'flight-top');
    const title = addText(top, 'div', '');
    addText(title, 'h3', `${formatDate(flight.date)} • ${flight.model}`);
    addText(title, 'div', `${flight.type} • ${flight.duration.toFixed(1)} minutes`, 'muted subtle');
    addText(card, 'p', `Location: ${flight.location}`);
    addText(card, 'p', `VO: ${flight.observer}`);
    addText(card, 'p', `Notes: ${flight.notes}`);
    const actions = addText(card, 'div', '', 'actions');
    const edit = addText(actions, 'button', 'Edit', 'btn secondary small');
    edit.type = 'button'; edit.addEventListener('click', () => editFlight(flight.id));
    const del = addText(actions, 'button', 'Delete', 'btn danger small');
    del.type = 'button'; del.addEventListener('click', () => deleteFlight(flight.id));
  }
  renderReport(total);
}
function renderReport(total) {
  const report = $('report'); report.replaceChildren();
  const header = addText(report, 'div', '', 'report-header');
  addText(header, 'h1', 'GEO 248 • UAV Flight Logbook');
  addText(header, 'p', `Generated: ${new Date().toLocaleString()} • Flight sessions: ${flights.length} • Total: ${total.toFixed(1)} minutes • Average: ${(flights.length ? total / flights.length : 0).toFixed(1)} minutes`);
  const table = addText(report, 'table', '', 'report-summary');
  const head = document.createElement('tr'); table.append(head);
  for (const label of ['UAV model', 'Recorded', 'Required', 'Remaining / status']) addText(head, 'th', label);
  for (const model of MODELS) {
    const minutes = flights.filter(f => f.model === model).reduce((sum, f) => sum + f.duration, 0);
    const tr = document.createElement('tr'); table.append(tr);
    for (const value of [model, `${minutes.toFixed(1)} min`, `${GOAL} min`, minutes >= GOAL ? 'Complete' : `${(GOAL - minutes).toFixed(1)} min remaining`]) addText(tr, 'td', value);
  }
  addText(report, 'h2', 'Individual flight records');
  if (!flights.length) addText(report, 'p', 'No flights recorded.');
  flights.forEach((f, i) => {
    const item = addText(report, 'div', '', 'report-record');
    addText(item, 'h3', `Flight ${i + 1} — ${formatDate(f.date)} — ${f.model}`);
    for (const [label, value] of [['Type', f.type], ['Duration', `${f.duration.toFixed(1)} minutes`], ['Location', f.location], ['Visual Observer', f.observer], ['Performance / issues / notes', f.notes]]) {
      addText(item, 'p', `${label}: ${value}`);
    }
  });
}
function csvEscape(value) { return '"' + String(value ?? '').replaceAll('"', '""') + '"'; }
function downloadCsv() {
  const rows = [HEADERS, ...flights.map(f => [formatDate(f.date), f.type, f.model, f.duration, f.location, f.observer, f.notes])];
  const content = '\ufeff' + rows.map(row => row.map(csvEscape).join(',')).join('\r\n') + '\r\n';
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'geo248_flights.csv'; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  notify(`CSV backup exported with ${flights.length} flight(s).`);
}
function parseCsv(text) {
  // RFC-style quoted fields, escaped quotes, embedded commas and newlines.
  const rows = []; let row = [], field = '', quoted = false;
  const source = text.replace(/^\ufeff/, '');
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"' && field === '') quoted = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[i + 1] === '\n') i++;
      row.push(field); if (row.some(v => v !== '')) rows.push(row);
      row = []; field = '';
    } else field += char;
  }
  if (quoted) throw new Error('CSV contains an unclosed quotation mark.');
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}
function flightFingerprint(f) {
  return JSON.stringify([f.date, f.type, f.model, f.duration, f.location, f.observer, f.notes]);
}
async function prepareImport(file) {
  pendingImport = null;
  const preview = $('importPreview'); preview.classList.add('hidden'); preview.replaceChildren();
  try {
    if (file.size > 5 * 1024 * 1024) throw new Error('CSV is larger than 5 MB.');
    const rows = parseCsv(await file.text());
    if (!rows.length || JSON.stringify(rows[0]) !== JSON.stringify(HEADERS)) {
      throw new Error(`CSV columns must be exactly: ${HEADERS.join(', ')}`);
    }
    const seen = new Set(flights.map(flightFingerprint));
    const fresh = []; let duplicates = 0;
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row.length !== HEADERS.length) throw new Error(`CSV row ${i + 1} has ${row.length} columns; expected 7.`);
      let record;
      try {
        record = validateFlight({ date: row[0], type: row[1], model: row[2], duration: row[3], location: row[4], observer: row[5], notes: row[6] });
      } catch (error) { throw new Error(`CSV row ${i + 1}: ${error.message}`); }
      const key = flightFingerprint(record);
      if (seen.has(key)) duplicates++;
      else { seen.add(key); fresh.push(record); }
    }
    pendingImport = fresh;
    preview.classList.remove('hidden');
    addText(preview, 'p', `Ready to import ${fresh.length} new flight(s). ${duplicates} matching record(s) skipped. Existing flights will be kept.`);
    const actions = addText(preview, 'div', '', 'actions');
    const confirmBtn = addText(actions, 'button', `Import ${fresh.length} flights`, 'btn small');
    confirmBtn.disabled = !fresh.length; confirmBtn.type = 'button';
    confirmBtn.addEventListener('click', async () => {
      try {
        const importRows = pendingImport; if (!importRows) return;
        await transaction('readwrite', store => { for (const record of importRows) store.put(record); });
        pendingImport = null; preview.classList.add('hidden');
        await loadFlights(); notify(`Imported ${importRows.length} flight(s) successfully.`);
      } catch (error) { notify('Import failed: ' + error.message, 'error'); }
    });
    const cancel = addText(actions, 'button', 'Cancel', 'btn secondary small'); cancel.type = 'button';
    cancel.addEventListener('click', () => { pendingImport = null; preview.classList.add('hidden'); });
  } catch (error) { notify('Import failed: ' + error.message, 'error'); }
}
async function initialize() {
  $('type').addEventListener('change', () => updateModelOptions());
  $('flightForm').addEventListener('submit', saveFlight);
  $('cancelBtn').addEventListener('click', resetForm);
  $('csvExport').addEventListener('click', downloadCsv);
  $('csvImportBtn').addEventListener('click', () => $('csvFile').click());
  $('csvFile').addEventListener('change', async event => {
    const file = event.target.files[0]; if (file) await prepareImport(file);
    event.target.value = '';
  });
  $('pdfExport').addEventListener('click', () => {
    if (!flights.length) { notify('Record or import at least one flight before exporting a PDF.', 'warning'); return; }
    window.print();
  });
  resetForm();
  try {
    if (!('indexedDB' in window)) throw new Error('IndexedDB is unavailable in this browser.');
    db = await openDatabase();
    await loadFlights();
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('./sw.js').catch(() => notify('Offline caching is unavailable; records can still be saved locally.', 'warning'));
    }
  } catch (error) {
    notify('Local storage unavailable: ' + error.message + '. Use a normal browser window, not private browsing.', 'error');
    $('saveBtn').disabled = true; $('csvImportBtn').disabled = true;
  }
}
document.addEventListener('DOMContentLoaded', initialize);
