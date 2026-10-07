(function () {
  const cfg = window.APP_CONFIG;
  const Api = window.Api;
  const $ = (id) => document.getElementById(id);

  // ---------- helpers ----------
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function todayISO() { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function fmtDateLabel(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }
  function fmtDateShort(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-').map(Number);
    return m + '/' + d + '/' + y;
  }
  function fmtTime12(t) {
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    return (h % 12 === 0 ? 12 : h % 12) + ':' + pad(m) + ' ' + (h >= 12 ? 'PM' : 'AM');
  }
  function toMillis(dateIso, timeStr) {
    if (!dateIso || !timeStr) return null;
    const [y, m, d] = dateIso.split('-').map(Number);
    const [h, mi] = timeStr.split(':').map(Number);
    return new Date(y, m - 1, d, h, mi).getTime();
  }
  function roundHalf(n) { return Math.round(n * 2) / 2; }

  // Display labels, derived from the raw fields (records from the Sheet arrive without them).
  function withLabels(r) {
    return {
      ...r,
      actualHoursLabel: (Number(r.actualHours) || 0).toFixed(1) + ' hrs',
      workDateLabel: fmtDateShort(r.workDate),
      startLabel: fmtDateShort(r.startDate) + ' ' + fmtTime12(r.startTime),
      endLabel: fmtDateShort(r.endDate) + ' ' + fmtTime12(r.endTime),
    };
  }

  // Downscale camera photos before storing/uploading (phone photos are often 5–10 MB).
  function compressImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Could not read photo.'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('Unsupported image.'));
        img.onload = () => {
          const scale = Math.min(1, cfg.PHOTO_MAX_SIDE / Math.max(img.width, img.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', cfg.PHOTO_QUALITY));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // ---------- state ----------
  const state = {
    actualHoursTouched: false,
    recordId: null,
    photo: null,
    history: [],
    submitting: false,
  };

  const el = {
    leadman: $('leadman'), team: $('team'), workDate: $('workDate'),
    startDate: $('startDate'), startTime: $('startTime'),
    endDate: $('endDate'), endTime: $('endTime'),
    actualHours: $('actualHours'), remarks: $('remarks'),
  };

  function fillSelect(select, options, placeholder) {
    const current = select.value;
    select.innerHTML = '';
    select.appendChild(new Option(placeholder, ''));
    options.forEach((o) => select.appendChild(new Option(o, o)));
    if (options.includes(current)) select.value = current;
  }

  function showView(name) {
    ['form', 'confirm', 'history'].forEach((v) => { $('view-' + v).hidden = v !== name; });
    window.scrollTo(0, 0);
  }

  function setError(msg) {
    $('errorMsg').textContent = msg || '';
    $('errorMsg').hidden = !msg;
    if (msg) $('errorMsg').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function elapsedHours() {
    const start = toMillis(el.startDate.value, el.startTime.value);
    const end = toMillis(el.endDate.value, el.endTime.value);
    if (start == null || end == null || end <= start) return null;
    return (end - start) / 3600000;
  }

  function actualHours() { return parseFloat(el.actualHours.value) || 0; }

  // Recompute derived UI: elapsed card, auto-filled hours, variance hint.
  function refresh() {
    const elapsed = elapsedHours();
    $('elapsedBox').hidden = elapsed == null;
    if (elapsed != null) {
      let h = Math.floor(elapsed), m = Math.round((elapsed - h) * 60);
      if (m === 60) { h += 1; m = 0; }
      $('elapsedLabel').textContent = h + 'h ' + pad(m) + 'm';
      if (!state.actualHoursTouched) el.actualHours.value = roundHalf(elapsed);
    }
    const variance = elapsed != null ? Math.abs(elapsed - actualHours()) : 0;
    const showHint = elapsed != null && variance >= cfg.VARIANCE_HINT_HOURS;
    $('varianceHint').hidden = !showHint;
    if (showHint) {
      $('varianceHint').textContent = '⚠ Actual hours differ from elapsed by ' + variance.toFixed(1) +
        ' hrs. Please explain in Remarks (break, standby, weather, traffic, equipment, etc.).';
    }
  }

  function renderPhoto() {
    $('photoPreview').hidden = !state.photo;
    if (state.photo) $('photoImg').src = state.photo; else $('photoImg').removeAttribute('src');
    $('photoLabel').textContent = state.photo ? 'Replace photo' : 'Add work photo';
  }

  function renderHistory() {
    $('historyCount').textContent = state.history.length;
    $('historyEmpty').hidden = state.history.length > 0;
    const list = $('historyList');
    list.innerHTML = '';
    state.history.forEach((r) => {
      const card = document.createElement('div');
      card.className = 'rec';
      const add = (cls, text, parent) => {
        const d = document.createElement('div');
        d.className = cls; d.textContent = text; (parent || card).appendChild(d); return d;
      };
      const top = add('rec-top', '');
      add('rec-name', r.leadman, top);
      add('rec-hours', r.actualHoursLabel, top);
      add('rec-meta', r.team + ' · ' + r.workDateLabel);
      add('rec-range', r.startLabel + ' → ' + r.endLabel);
      if (r.remarks) add('rec-remarks', '"' + r.remarks + '"');
      if (r.photo) {
        const img = document.createElement('img');
        img.src = r.photo; img.alt = 'Work photo'; img.loading = 'lazy';
        card.appendChild(img);
      } else if (r.photoUrl) {
        // Drive photos may be private to the owner, so link instead of embedding.
        const a = document.createElement('a');
        a.className = 'rec-photo-link'; a.href = r.photoUrl; a.target = '_blank'; a.rel = 'noopener';
        a.textContent = '📷 View photo in Drive';
        card.appendChild(a);
      }
      list.appendChild(card);
    });
  }

  function newRecordId() {
    const now = new Date();
    return 'WH-' + now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()) + '-' + Math.floor(1000 + Math.random() * 9000);
  }

  function resetForm() {
    // One ID per entry, reused on retry, so the server can drop a duplicate
    // if a timed-out submission actually went through.
    state.recordId = newRecordId();
    el.team.value = '';
    [el.workDate, el.startDate, el.endDate].forEach((i) => { i.value = todayISO(); });
    el.startTime.value = cfg.DEFAULT_START_TIME;
    el.endTime.value = cfg.DEFAULT_END_TIME;
    el.remarks.value = '';
    state.actualHoursTouched = false;
    state.photo = null;
    $('photoInput').value = '';
    setError('');
    renderPhoto();
    refresh();
  }

  function validate() {
    if (!el.leadman.value) return 'Please select a Leadman.';
    if (!el.team.value) return 'Please select a Team.';
    if (!el.workDate.value) return 'Please enter the work date.';
    if (elapsedHours() == null) return 'End date/time must be after start date/time.';
    if (actualHours() <= 0) return 'Please enter Actual Hours Worked.';
    return null;
  }

  function buildRecord() {
    const now = new Date();
    const hours = roundHalf(actualHours());
    return withLabels({
      id: state.recordId,
      leadman: el.leadman.value,
      team: el.team.value,
      workDate: el.workDate.value,
      startDate: el.startDate.value, startTime: el.startTime.value,
      endDate: el.endDate.value, endTime: el.endTime.value,
      elapsedHours: Math.round(elapsedHours() * 100) / 100,
      actualHours: hours,
      remarks: el.remarks.value.trim(),
      photo: state.photo,
      submittedAt: now.toISOString(),
    });
  }

  function setSubmitting(on) {
    state.submitting = on;
    const btn = $('submitBtn');
    btn.disabled = on;
    btn.innerHTML = on ? '<span class="spinner"></span> SAVING…' : 'SUBMIT RECORD';
  }

  function showConfirm(rec) {
    $('cId').textContent = rec.id;
    $('cLeadman').textContent = rec.leadman;
    $('cTeam').textContent = rec.team;
    $('cHours').textContent = rec.actualHoursLabel;
    $('confirmSub').textContent = Api.online ? 'Synced to Google Sheets' : 'Saved on this device (offline mode)';
    $('cPhoto').hidden = !rec.photo;
    if (rec.photo) $('cPhoto').src = rec.photo;
    showView('confirm');
  }

  // ---------- events ----------
  el.leadman.addEventListener('change', () => {
    try { localStorage.setItem('lwhr_leadman', el.leadman.value); } catch (e) {}
    if (Api.online) loadHistory(el.leadman.value);
  });
  [el.startDate, el.startTime, el.endDate, el.endTime].forEach((i) => i.addEventListener('change', refresh));
  // Keep end date in step with start date when the user moves the start forward.
  el.startDate.addEventListener('change', () => {
    if (el.endDate.value < el.startDate.value) { el.endDate.value = el.startDate.value; refresh(); }
  });
  el.actualHours.addEventListener('input', () => { state.actualHoursTouched = true; refresh(); });
  $('incActual').addEventListener('click', () => {
    state.actualHoursTouched = true;
    el.actualHours.value = roundHalf(actualHours() + 0.5);
    refresh();
  });
  $('decActual').addEventListener('click', () => {
    state.actualHoursTouched = true;
    el.actualHours.value = Math.max(0, roundHalf(actualHours() - 0.5));
    refresh();
  });

  $('photoInput').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      state.photo = await compressImage(file);
      setError('');
    } catch (err) {
      setError(err.message);
    }
    renderPhoto();
  });
  $('removePhoto').addEventListener('click', () => {
    state.photo = null;
    $('photoInput').value = '';
    renderPhoto();
  });

  $('recordForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (state.submitting) return;
    const err = validate();
    if (err) return setError(err);
    setError('');
    setSubmitting(true);
    try {
      const saved = withLabels(await Api.submitRecord(buildRecord()));
      state.history = [saved, ...state.history.filter((r) => r.id !== saved.id)].slice(0, cfg.HISTORY_LIMIT);
      renderHistory();
      showConfirm(saved);
    } catch (ex) {
      setError('Could not save record: ' + ex.message + '. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  });

  document.querySelectorAll('[data-action="history"]').forEach((b) => b.addEventListener('click', () => showView('history')));
  $('backToForm').addEventListener('click', () => showView('form'));
  $('newEntry').addEventListener('click', () => { resetForm(); showView('form'); });

  // ---------- init ----------
  async function init() {
    $('todayLabel').textContent = fmtDateLabel(todayISO());
    $('modeBadge').textContent = Api.online ? 'ONLINE' : 'LOCAL';
    $('modeBadge').classList.toggle('online', Api.online);

    fillSelect(el.leadman, cfg.LEADMEN, 'Select leadman…');
    fillSelect(el.team, cfg.TEAMS, 'Select team…');
    let savedLeadman = '';
    try { savedLeadman = localStorage.getItem('lwhr_leadman') || ''; } catch (e) {}
    el.leadman.value = savedLeadman;
    resetForm();

    const [opts] = await Promise.all([Api.getOptions(), loadHistory(savedLeadman)]);
    fillSelect(el.leadman, opts.leadmen, 'Select leadman…');
    fillSelect(el.team, opts.teams, 'Select team…');
    if (!el.leadman.value && opts.leadmen.includes(savedLeadman)) el.leadman.value = savedLeadman;
  }

  async function loadHistory(leadman) {
    const records = await Api.listRecords(leadman);
    if (leadman !== el.leadman.value && el.leadman.value) return; // a newer selection won
    state.history = records.map(withLabels);
    renderHistory();
  }

  init();
})();
