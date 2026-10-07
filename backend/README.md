# Backend: Google Apps Script (Sheets + Drive)

`Code.gs` is a Google Apps Script web app. For each submission it:

- adds a row to the **Records** tab of a Google Sheet;
- saves the photo to a Google Drive folder, in subfolders by month (`2026-10/WH-20261007-1234_Pedro-Reyes.jpg`), and links to it from the row;
- reads the leadman and team dropdowns from the **Lists** tab, so you can change them without touching code.

## Deploy (about 5 minutes)

1. Go to <https://script.google.com> and click **New project**. Name it "Leadman Work Hours".
2. Replace the contents of `Code.gs` with this folder's `Code.gs`.
3. Open **Project Settings** (gear icon) and tick **Show "appsscript.json" manifest file in editor**. Replace that file's contents with this folder's `appsscript.json`.
4. In the editor, choose the `setup` function and click **Run**. Approve the permissions prompt. The execution log prints the links to the new Sheet and photo folder.
   - To use an existing Sheet or folder instead, paste its ID into `CONFIG.SPREADSHEET_ID` / `CONFIG.PHOTO_FOLDER_ID` before running `setup`.
5. Click **Deploy > New deployment**. Choose the type **Web app**, set **Execute as: Me** and **Who has access: Anyone**, then click **Deploy**.
6. Copy the **Web app URL** (it ends in `/exec`) into `API_URL` in `js/config.js`. The app's header badge changes from **LOCAL** to **ONLINE**.

To check the deployment, open the `/exec` URL in a browser. It should return `{"ok":true,...}`.

### Updating the code later
Edit `Code.gs`, then go to **Deploy > Manage deployments**, click the pencil icon, set **Version: New version** and click **Deploy**. Doing it this way keeps the same URL. Creating a *new* deployment gives you a new URL instead.

## Sheet layout

**Records**: Record ID · Submitted At · Leadman · Team · Work Date · Start Date · Start Time · End Date · End Time · Elapsed Hours · Actual Hours · Variance (hrs) · Remarks · Photo

**Lists**: column A is Leadmen and column B is Teams. Add or remove names there and the app picks up the change the next time it loads. Submissions with a name that isn't on the list are rejected.

## Settings (`CONFIG` in Code.gs)

| Setting | Default | Meaning |
|---|---|---|
| `SHARE_PHOTOS_BY_LINK` | `false` | Photos are private to the Drive owner. Set it to `true` so leadmen can open photos from the app's History screen. |
| `HISTORY_LIMIT` | `50` | How many recent records the History screen shows. |
| `MAX_PHOTO_BYTES` | 10 MB | Upload size limit. The app already shrinks photos to about 300–600 KB. |

## Notes

- **Security.** "Anyone" access means anyone who has the URL can submit records. They can only use names from the Lists tab, and every field is validated. Remarks that start with `=`, `+`, `-` or `@` are stored as text so they can't run as Sheet formulas. Share the URL only with your crews.
- **Duplicates.** Each entry keeps the same record ID if it's retried, so a retry after a timeout doesn't create a second row.
- **Concurrency.** Writes are serialized with `LockService`, so several leadmen can submit at the same time safely.
