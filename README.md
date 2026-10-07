# Leadman Work Hours Record

A mobile-first web form that leadmen use to log daily work hours: team, work date, start and end times, actual hours, remarks, and an optional photo.

## Status

- **Frontend:** plain HTML, CSS and JS with no build step (repository root).
- **Backend:** a Google Apps Script web app in [`backend/`](backend/README.md) that writes records to a Google Sheet and saves photos to a Google Drive folder. See `backend/README.md` for the deployment steps.

## Live site

**https://leadman-work-hours.netlify.app**: hosted on Netlify (project `leadman-work-hours`). `netlify.toml` publishes only `index.html`, `css/` and `js/`, and serves the JS and CSS with `no-cache` so phones pick up changes right away.

To publish changes, redeploy from this folder. To have every push redeploy automatically, connect the GitHub repo under Netlify → Project configuration → Build & deploy.

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

## Backend API

| Call | Request | Response |
|---|---|---|
| Options | `GET ?action=options` | `{ ok, leadmen: [], teams: [] }` |
| History | `GET ?action=list&leadman=<name>` | `{ ok, records: [] }` |
| Submit | `POST` (text/plain JSON) `{ action: "submit", record, photo: { base64, mimeType, fileName } \| null }` | `{ ok, id, photoUrl }` |

To go live, paste the deployed web app URL into `API_URL` in `js/config.js`.
