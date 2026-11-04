# GEO 248 UAV Flight Logbook — Offline PWA

A phone-friendly, offline-first web app based on the existing GEO 248 Python logbook. Your original Python file is **not changed**.

## Features
- In-person flights: DJI Mini 3 Pro / DJI Mini 5 Pro; location and Visual Observer required.
- Virtual flights: Virtual Phantom 4; location and VO automatically marked N/A.
- Positive numeric durations, nonblank notes, valid dates, model/type validation.
- Local IndexedDB storage, editing, deletion with confirmation, progress toward 30 minutes per model.
- Export CSV with the **same seven column headings as the Python program**: Date, Type, UAV, Duration, Location, VO, Notes.
- Import CSV from the Python program or this app, with validation, preview and content-based duplicate detection.
- Print-to-PDF flight report with summary and every flight's details.
- Service worker caches the app for offline use **after the first successful online visit**.

## Run on your Mac for testing

1. Unzip the folder.
2. Open Terminal and navigate into the `GEO248_Flight_Logbook_PWA` folder.
3. Run `python3 -m http.server 8000`.
4. Open `http://localhost:8000` in Chrome or Safari.

**Do not open `index.html` directly as a file**: service workers require a secure context such as `localhost` or HTTPS.

## Install on iPhone / Android

1. Upload the contents of the folder to a free HTTPS static host such as GitHub Pages or Cloudflare Pages.
2. Visit the published HTTPS address on your phone **while online**, and wait for it to load.
3. iPhone: Safari → Share → Add to Home Screen. Android: Chrome → Install app / Add to Home screen.
4. After installation and a successful initial load, the app can open without a network connection. Test offline before going to the field.

Some mobile browsers may not recognize an SVG-only icon as installable; if the install option is missing, use Add to Home Screen or add PNG icon assets later.

## PDF export

Tap **Export PDF**. The browser opens the system print dialog; choose **Save as PDF**. On iPhone, use the print preview's Share action to save the PDF to Files. This method does not require external libraries or an internet connection. PDF export is **not** a direct one-click PDF download.

## Backups and privacy

Records stay on each device; there is no server-side database or account. Clearing site data, removing the app, or device failure may erase records. Export a CSV backup regularly and store it outside the browser. Imports skip identical flights, but identical legitimate flight sessions with all seven fields the same are also considered duplicates. No automatic synchronization occurs.

## CSV compatibility

The CSV export format matches the seven-column CSV used by `UAV_Flight_Logbook_GEO248.py`. Python CSVs can be imported directly. Imported records get local IDs for editing/deleting; those IDs are not written into CSV to preserve compatibility.
