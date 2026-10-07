// Data layer. app.js only talks to window.Api, so swapping local storage for the
// Google Sheets / Drive backend only touches this file (and config.js).
//
// Backend contract (Google Apps Script Web App, to be built):
//   GET  ?action=options                 -> { ok, leadmen: [...], teams: [...] }
//   GET  ?action=list&leadman=<name>     -> { ok, records: [...] }
//   POST { action: 'submit', record, photo: { base64, mimeType, fileName } | null }
//                                        -> { ok, id, photoUrl }
// POST bodies are sent as text/plain so the browser skips the CORS preflight,
// which Apps Script cannot answer.
(function () {
  const cfg = window.APP_CONFIG;
  const HISTORY_KEY = 'lwhr_history';
  const online = !!cfg.API_URL;

  function readLocal() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch (e) { return []; }
  }

  function writeLocal(history) {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch (e) {
      // Quota exceeded (photos are large): keep the records, drop the oldest photos.
      const slim = history.map((r, i) => (i === 0 ? r : { ...r, photo: r.photoUrl || null }));
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(slim)); } catch (e2) {}
    }
  }

  async function request(params, body) {
    const url = new URL(cfg.API_URL);
    Object.entries(params || {}).forEach(([k, v]) => url.searchParams.set(k, v));
    const res = await fetch(url.toString(), body
      ? { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) }
      : { method: 'GET' });
    if (!res.ok) throw new Error('Server error (' + res.status + ')');
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Request failed');
    return data;
  }

  function splitDataUrl(dataUrl) {
    const m = /^data:([^;]+);base64,(.*)$/.exec(dataUrl || '');
    return m ? { mimeType: m[1], base64: m[2] } : null;
  }

  window.Api = {
    online,

    async getOptions() {
      if (!online) return { leadmen: cfg.LEADMEN, teams: cfg.TEAMS };
      try {
        const d = await request({ action: 'options' });
        return { leadmen: d.leadmen || cfg.LEADMEN, teams: d.teams || cfg.TEAMS };
      } catch (e) {
        return { leadmen: cfg.LEADMEN, teams: cfg.TEAMS };
      }
    },

    async listRecords(leadman) {
      if (!online) return readLocal();
      try {
        const d = await request({ action: 'list', leadman: leadman || '' });
        return d.records || [];
      } catch (e) {
        return readLocal(); // offline fallback: show what this device sent
      }
    },

    // Saves a record; returns the stored record (with id / photoUrl from the server when online).
    async submitRecord(record) {
      let saved = record;
      if (online) {
        const parts = splitDataUrl(record.photo);
        const { photo, ...fields } = record;
        const d = await request(null, {
          action: 'submit',
          record: fields,
          photo: parts ? { ...parts, fileName: record.id + '.jpg' } : null,
        });
        saved = { ...record, id: d.id || record.id, photoUrl: d.photoUrl || null };
      }
      const history = [saved, ...readLocal()].slice(0, cfg.HISTORY_LIMIT);
      writeLocal(history);
      return saved;
    },
  };
})();
