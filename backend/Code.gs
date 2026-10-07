/**
 * Leadman Work Hours Record — Google Apps Script backend.
 *
 * Stores each submission as a row in a Google Sheet and saves photos to a
 * Google Drive folder (one subfolder per month). Deployed as a Web App, it
 * serves the JSON API the frontend calls (see README.md):
 *
 *   GET  ?action=options                -> { ok, leadmen, teams }
 *   GET  ?action=list&leadman=<name>    -> { ok, records }
 *   POST { action: 'submit', record, photo } -> { ok, id, photoUrl }
 *
 * First-time setup: run setup() once from the Apps Script editor.
 */

const CONFIG = {
  // Leave blank and run setup() to create new ones, or paste existing IDs here.
  SPREADSHEET_ID: '',
  PHOTO_FOLDER_ID: '',

  SPREADSHEET_NAME: 'Leadman Work Hours Record',
  PHOTO_FOLDER_NAME: 'Leadman Work Hours Photos',
  RECORDS_SHEET: 'Records',
  LISTS_SHEET: 'Lists',

  // false: photos stay private to the Drive owner (the Sheet links to them).
  // true: anyone with the link can view, so leadmen can open photos from History.
  SHARE_PHOTOS_BY_LINK: false,

  HISTORY_LIMIT: 50,
  MAX_PHOTO_BYTES: 10 * 1024 * 1024,
  MAX_REMARKS_LENGTH: 1000,

  DEFAULT_LEADMEN: ['Juan Dela Cruz', 'Pedro Reyes', 'Mario Santos', 'Ramon Flores', 'Ernesto Bautista'],
  DEFAULT_TEAMS: ['Team Alpha', 'Team Bravo', 'Team Charlie', 'Team Delta'],
};

// Column order in the Records sheet. `key` maps to the record field sent by the app.
// `format` is applied to each written row: '@' keeps dates/times as typed text so
// Sheets doesn't reinterpret them; hours stay numeric so they can be summed.
const TEXT = '@';
const HOURS = '0.00';
const COLUMNS = [
  { key: 'id', header: 'Record ID', format: TEXT },
  { key: 'submittedAt', header: 'Submitted At', format: 'yyyy-mm-dd hh:mm' },
  { key: 'leadman', header: 'Leadman', format: TEXT },
  { key: 'team', header: 'Team', format: TEXT },
  { key: 'workDate', header: 'Work Date', format: TEXT },
  { key: 'startDate', header: 'Start Date', format: TEXT },
  { key: 'startTime', header: 'Start Time', format: TEXT },
  { key: 'endDate', header: 'End Date', format: TEXT },
  { key: 'endTime', header: 'End Time', format: TEXT },
  { key: 'elapsedHours', header: 'Elapsed Hours', format: HOURS },
  { key: 'actualHours', header: 'Actual Hours', format: HOURS },
  { key: 'variance', header: 'Variance (hrs)', format: HOURS },
  { key: 'remarks', header: 'Remarks', format: TEXT },
  { key: 'photoUrl', header: 'Photo', format: TEXT },
];

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

/** Creates (or connects) the Sheet and Drive folder. Safe to run more than once. */
function setup() {
  const ss = getSpreadsheet_();
  const folder = getPhotoFolder_();
  ensureSheets_(ss);
  Logger.log('Spreadsheet: ' + ss.getUrl());
  Logger.log('Photo folder: ' + folder.getUrl());
  Logger.log('Next: Deploy > New deployment > Web app, then paste the /exec URL into js/config.js (API_URL).');
}

function props_() {
  return PropertiesService.getScriptProperties();
}

function getSpreadsheet_() {
  const id = CONFIG.SPREADSHEET_ID || props_().getProperty('SPREADSHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  const ss = SpreadsheetApp.create(CONFIG.SPREADSHEET_NAME);
  props_().setProperty('SPREADSHEET_ID', ss.getId());
  ensureSheets_(ss);
  return ss;
}

function getPhotoFolder_() {
  const id = CONFIG.PHOTO_FOLDER_ID || props_().getProperty('PHOTO_FOLDER_ID');
  if (id) return DriveApp.getFolderById(id);
  const folder = DriveApp.createFolder(CONFIG.PHOTO_FOLDER_NAME);
  props_().setProperty('PHOTO_FOLDER_ID', folder.getId());
  return folder;
}

function ensureSheets_(ss) {
  let records = ss.getSheetByName(CONFIG.RECORDS_SHEET);
  if (!records) {
    const first = ss.getSheets()[0];
    // Reuse the blank default "Sheet1" of a freshly created spreadsheet.
    records = first && first.getLastRow() === 0 && ss.getSheets().length === 1
      ? first.setName(CONFIG.RECORDS_SHEET)
      : ss.insertSheet(CONFIG.RECORDS_SHEET);
  }
  if (records.getLastRow() === 0) {
    records.getRange(1, 1, 1, COLUMNS.length)
      .setValues([COLUMNS.map(function (c) { return c.header; })])
      .setFontWeight('bold').setBackground('#f28a1e');
    records.setFrozenRows(1);
  }

  let lists = ss.getSheetByName(CONFIG.LISTS_SHEET);
  if (!lists) {
    lists = ss.insertSheet(CONFIG.LISTS_SHEET);
    const rows = Math.max(CONFIG.DEFAULT_LEADMEN.length, CONFIG.DEFAULT_TEAMS.length);
    const values = [['Leadmen', 'Teams']];
    for (let i = 0; i < rows; i++) values.push([CONFIG.DEFAULT_LEADMEN[i] || '', CONFIG.DEFAULT_TEAMS[i] || '']);
    lists.getRange(1, 1, values.length, 2).setValues(values);
    lists.getRange(1, 1, 1, 2).setFontWeight('bold').setBackground('#f28a1e');
    lists.setFrozenRows(1);
  }
}

// ---------------------------------------------------------------------------
// Web App entry points
// ---------------------------------------------------------------------------

function doGet(e) {
  return handle_(function () {
    const action = (e && e.parameter && e.parameter.action) || '';
    if (action === 'options') return getOptions_();
    if (action === 'list') return listRecords_(e.parameter.leadman || '');
    if (action === 'ping' || action === '') return { ok: true, service: 'Leadman Work Hours Record' };
    throw new Error('Unknown action: ' + action);
  });
}

function doPost(e) {
  return handle_(function () {
    if (!e || !e.postData || !e.postData.contents) throw new Error('Empty request body.');
    let body;
    try { body = JSON.parse(e.postData.contents); } catch (err) { throw new Error('Invalid JSON.'); }
    if (body.action === 'submit') return submitRecord_(body.record, body.photo);
    throw new Error('Unknown action: ' + body.action);
  });
}

function handle_(fn) {
  let result;
  try {
    result = fn();
  } catch (err) {
    result = { ok: false, error: err.message || String(err) };
  }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function getOptions_() {
  const lists = readLists_();
  return { ok: true, leadmen: lists.leadmen, teams: lists.teams };
}

function readLists_() {
  const sheet = getSpreadsheet_().getSheetByName(CONFIG.LISTS_SHEET);
  const lastRow = sheet ? sheet.getLastRow() : 0;
  if (lastRow < 2) return { leadmen: CONFIG.DEFAULT_LEADMEN, teams: CONFIG.DEFAULT_TEAMS };
  const values = sheet.getRange(2, 1, lastRow - 1, 2).getDisplayValues();
  const col = function (i) {
    return values.map(function (r) { return String(r[i]).trim(); }).filter(function (v) { return v; });
  };
  return { leadmen: col(0), teams: col(1) };
}

function listRecords_(leadman) {
  const sheet = getSpreadsheet_().getSheetByName(CONFIG.RECORDS_SHEET);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { ok: true, records: [] };

  const rows = sheet.getRange(2, 1, lastRow - 1, COLUMNS.length).getDisplayValues();
  const records = [];
  // Newest rows are at the bottom; walk backwards until we have enough.
  for (let i = rows.length - 1; i >= 0 && records.length < CONFIG.HISTORY_LIMIT; i--) {
    const rec = rowToRecord_(rows[i]);
    if (!leadman || rec.leadman === leadman) records.push(rec);
  }
  return { ok: true, records: records };
}

function submitRecord_(record, photo) {
  const rec = validateRecord_(record);

  // Serialize writes so concurrent submissions can't collide or duplicate.
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sheet = getSpreadsheet_().getSheetByName(CONFIG.RECORDS_SHEET);

    // Idempotent: a retried submission with the same ID returns the stored row.
    const existing = findRowById_(sheet, rec.id);
    if (existing) return { ok: true, id: rec.id, photoUrl: existing.photoUrl || null, duplicate: true };

    rec.photoUrl = photo ? savePhoto_(photo, rec) : '';
    rec.variance = round2_(rec.actualHours - rec.elapsedHours);

    const submitted = new Date(rec.submittedAt);
    rec.submittedAt = isNaN(submitted.getTime()) ? new Date() : submitted;
    const row = COLUMNS.map(function (c) { return sanitizeCell_(rec[c.key]); });
    sheet.getRange(sheet.getLastRow() + 1, 1, 1, COLUMNS.length)
      .setNumberFormats([COLUMNS.map(function (c) { return c.format; })])
      .setValues([row]);
    return { ok: true, id: rec.id, photoUrl: rec.photoUrl || null };
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function validateRecord_(r) {
  if (!r || typeof r !== 'object') throw new Error('Missing record.');
  const str = function (v) { return v == null ? '' : String(v).trim(); };
  const isDate = function (v) { return /^\d{4}-\d{2}-\d{2}$/.test(v); };
  const isTime = function (v) { return /^\d{2}:\d{2}$/.test(v); };

  const rec = {
    id: str(r.id),
    submittedAt: str(r.submittedAt) || new Date().toISOString(),
    leadman: str(r.leadman),
    team: str(r.team),
    workDate: str(r.workDate),
    startDate: str(r.startDate),
    startTime: str(r.startTime),
    endDate: str(r.endDate),
    endTime: str(r.endTime),
    actualHours: Number(r.actualHours),
    remarks: str(r.remarks).slice(0, CONFIG.MAX_REMARKS_LENGTH),
  };

  if (!/^WH-\d{8}-\d{4}$/.test(rec.id)) throw new Error('Invalid record ID.');
  const lists = readLists_();
  if (lists.leadmen.indexOf(rec.leadman) === -1) throw new Error('Unknown leadman: ' + rec.leadman);
  if (lists.teams.indexOf(rec.team) === -1) throw new Error('Unknown team: ' + rec.team);
  if (!isDate(rec.workDate) || !isDate(rec.startDate) || !isDate(rec.endDate)) throw new Error('Invalid date.');
  if (!isTime(rec.startTime) || !isTime(rec.endTime)) throw new Error('Invalid time.');

  const start = toMillis_(rec.startDate, rec.startTime);
  const end = toMillis_(rec.endDate, rec.endTime);
  if (!(end > start)) throw new Error('End date/time must be after start date/time.');
  rec.elapsedHours = round2_((end - start) / 3600000);
  if (rec.elapsedHours > 48) throw new Error('Shift longer than 48 hours — please check the dates.');
  if (!(rec.actualHours > 0) || rec.actualHours > 48) throw new Error('Invalid actual hours.');
  return rec;
}

function savePhoto_(photo, rec) {
  if (!photo.base64 || !/^image\/(jpeg|png|webp|heic|heif)$/.test(photo.mimeType || '')) {
    throw new Error('Unsupported photo type.');
  }
  const bytes = Utilities.base64Decode(photo.base64);
  if (bytes.length > CONFIG.MAX_PHOTO_BYTES) throw new Error('Photo is too large.');

  const ext = photo.mimeType.split('/')[1].replace('jpeg', 'jpg');
  const name = rec.id + '_' + rec.leadman.replace(/[^\w\- ]+/g, '').replace(/\s+/g, '-') + '.' + ext;
  const blob = Utilities.newBlob(bytes, photo.mimeType, name);

  const file = monthFolder_(rec.workDate).createFile(blob);
  file.setDescription(rec.leadman + ' · ' + rec.team + ' · ' + rec.workDate);
  if (CONFIG.SHARE_PHOTOS_BY_LINK) {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  }
  return file.getUrl();
}

/** Photos are grouped into subfolders named YYYY-MM by work date. */
function monthFolder_(workDate) {
  const root = getPhotoFolder_();
  const name = workDate.slice(0, 7);
  const it = root.getFoldersByName(name);
  return it.hasNext() ? it.next() : root.createFolder(name);
}

function findRowById_(sheet, id) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  const match = sheet.getRange(2, 1, lastRow - 1, 1).createTextFinder(id).matchEntireCell(true).findNext();
  if (!match) return null;
  return rowToRecord_(sheet.getRange(match.getRow(), 1, 1, COLUMNS.length).getDisplayValues()[0]);
}

function rowToRecord_(row) {
  const rec = {};
  COLUMNS.forEach(function (c, i) { rec[c.key] = unsanitizeCell_(row[i]); });
  rec.actualHours = Number(rec.actualHours) || 0;
  rec.elapsedHours = Number(rec.elapsedHours) || 0;
  return rec;
}

// Block spreadsheet formula injection from free-text fields (e.g. remarks "=IMPORTXML(...)").
function sanitizeCell_(v) {
  if (typeof v === 'string' && /^[=+\-@]/.test(v)) return "'" + v;
  return v == null ? '' : v;
}

function unsanitizeCell_(v) {
  return typeof v === 'string' && /^'[=+\-@]/.test(v) ? v.slice(1) : v;
}

function toMillis_(dateIso, time) {
  const d = dateIso.split('-').map(Number);
  const t = time.split(':').map(Number);
  return Date.UTC(d[0], d[1] - 1, d[2], t[0], t[1]);
}

function round2_(n) {
  return Math.round(n * 100) / 100;
}
