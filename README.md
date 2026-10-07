# Leadman Work Hours Record

A mobile-first web form that leadmen use to log daily work hours: team, work date, start and end times, actual hours, remarks, and an optional photo.

## Status

- **Frontend: done.** Plain HTML, CSS and JS with no build step.
- **Backend: next.** A Google Apps Script web app that writes records to a Google Sheet and saves photos to a Google Drive folder.

## Run locally

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

With `API_URL` left empty in `js/config.js`, the app runs in **LOCAL** mode and stores records in the browser's `localStorage`.

## Structure

| File | Purpose |
|---|---|
| `index.html` | Markup for the three screens: form, confirmation and history |
| `css/styles.css` | Dark, high-contrast theme for use outdoors |
| `js/config.js` | Backend URL, fallback leadman and team lists, defaults |
| `js/api.js` | Data layer. This is the only file that talks to storage or the backend |
| `js/app.js` | UI logic: validation, elapsed-time calculation, variance hint, photo compression |

## Backend contract (for the Apps Script step)

| Call | Request | Response |
|---|---|---|
| Options | `GET ?action=options` | `{ ok, leadmen: [], teams: [] }` |
| History | `GET ?action=list&leadman=<name>` | `{ ok, records: [] }` |
| Submit | `POST` (text/plain JSON) `{ action: "submit", record, photo: { base64, mimeType, fileName } \| null }` | `{ ok, id, photoUrl }` |

Planned Sheet columns: Record ID, Submitted At, Leadman, Team, Work Date, Start Date, Start Time, End Date, End Time, Elapsed Hours, Actual Hours, Remarks, Photo URL.

To go live, paste the deployed web app URL into `API_URL` in `js/config.js`.
