// App configuration.
// Leave API_URL empty to run in local mode (records are kept on this device only).
// Once the Google Apps Script backend is deployed, paste its Web App URL here
// (https://script.google.com/macros/s/.../exec) to sync to Google Sheets + Drive.
window.APP_CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbxP0-RebEKr2TxayxqJSOmcDW-H0Z-MqsarcxWvPL0cjGbrBfuMZulOhWdlvSdrIAgbVA/exec',

  // Fallback dropdown lists. In online mode these are loaded from the Sheet instead.
  LEADMEN: ['Juan Dela Cruz', 'Pedro Reyes', 'Mario Santos', 'Ramon Flores', 'Ernesto Bautista'],
  TEAMS: ['Team Alpha', 'Team Bravo', 'Team Charlie', 'Team Delta'],

  DEFAULT_START_TIME: '07:00',
  DEFAULT_END_TIME: '16:00',
  VARIANCE_HINT_HOURS: 0.75,
  HISTORY_LIMIT: 50,
  PHOTO_MAX_SIDE: 1600,
  PHOTO_QUALITY: 0.8,
};
