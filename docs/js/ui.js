/* Shared UI helpers: icons, DOM, toasts, form rendering/validation, downloads, page chrome. */
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

const ICONS = {
  check: 'M20 6 9 17l-5-5',
  x: 'M18 6 6 18M6 6l12 12',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  file: 'M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2zM14 2v6h6',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  plus: 'M12 5v14M5 12h14',
  alert: 'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  printer: 'M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z',
  refresh: 'M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5',
  users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  send: 'M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z',
  back: 'M19 12H5M12 19l-7-7 7-7',
  next: 'M5 12h14M12 5l7 7-7 7'
};
function icon(n) {
  return '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="' + (ICONS[n] || '') + '"/></svg>';
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---------- page chrome ---------- */
function topbar(subtitle, actionsHtml) {
  return '<a class="skip" href="#main">Skip to content</a><header class="topbar"><div class="wrap">' +
    '<div class="brand"><img src="img/logo.png" width="127" height="38" alt="' + esc(window.APP_NAME) + '"><span class="sub">' + esc(subtitle) + '</span></div>' +
    (actionsHtml || '') + '</div></header>';
}

let toastTimer;
function toast(msg) {
  let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = msg; t.style.display = 'block';
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.style.display = 'none'; }, 3800);
}

function busy(btn, on, label) {
  if (!btn) return;
  if (on) { btn.dataset.l = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spin"></span> ' + (label || 'Working…'); }
  else { btn.disabled = false; if (btn.dataset.l) btn.innerHTML = btn.dataset.l; }
}

function requireLogin(roles) {
  if (!Session.token || (roles && roles.indexOf(Session.role) < 0)) { Session.clear(); location.href = 'index.html'; return false; }
  return true;
}
function doLogout() {
  call('logout', Session.token).catch(() => {}).then(() => { Session.clear(); location.href = 'index.html'; });
}

/* ---------- form rendering from the server field spec ---------- */
function fieldHtml(f, value, lists, prefix) {
  const id = (prefix || 'f') + '_' + f.k;
  const opts = f.options || (f.list && lists[f.list]) || [];
  value = value || '';
  let ctl;
  if (f.type === 'select') {
    ctl = '<select id="' + id + '" data-k="' + f.k + '"><option value="">Select…</option>' +
      opts.map(o => '<option' + (o === value ? ' selected' : '') + '>' + esc(o) + '</option>').join('') + '</select>';
  } else if (f.type === 'textarea') {
    ctl = '<textarea id="' + id + '" data-k="' + f.k + '" maxlength="' + (f.max || 300) + '">' + esc(value) + '</textarea>';
  } else {
    const t = f.type === 'date' ? 'date' : f.type === 'email' ? 'email' : f.type === 'tel' ? 'tel' : 'text';
    const mode = f.k === 'Mobile' || f.k === 'EmergencyNo' ? ' inputmode="tel"' : '';
    ctl = '<input id="' + id + '" data-k="' + f.k + '" type="' + t + '" value="' + esc(value) + '"' + mode +
      (f.max ? ' maxlength="' + f.max + '"' : '') + (f.datalist ? ' list="dl_' + f.k + '"' : '') + ' autocomplete="off">' +
      (f.datalist ? '<datalist id="dl_' + f.k + '">' + opts.map(o => '<option value="' + esc(o) + '">').join('') + '</datalist>' : '');
  }
  return '<div class="fld' + (f.type === 'textarea' ? ' full' : '') + '"><label for="' + id + '">' + esc(f.label) + (f.req ? ' <span class="req" aria-hidden="true">*</span>' : '') + '</label>' +
    ctl + (f.hint ? '<div class="hint">' + esc(f.hint) + '</div>' : '') + '<div class="err" role="alert" data-err="' + f.k + '"></div></div>';
}

function readFields(root, spec) {
  const o = {};
  spec.forEach(f => {
    if (f.type === 'file' || f.type === 'files') return;
    const el = $('[data-k="' + f.k + '"]', root);
    if (el) o[f.k] = el.value.trim();
  });
  return o;
}

function localAge(birth) {
  const b = birth.split('-').map(Number), n = new Date();
  let a = n.getFullYear() - b[0];
  if (n.getMonth() + 1 < b[1] || (n.getMonth() + 1 === b[1] && n.getDate() < b[2])) a--;
  return a;
}
function todayStr() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

/** Mirrors the server rules for fast feedback. The server re-validates everything. */
function checkField(f, v, data) {
  if (!v) return f.req && !(f.reqUnless && data && data[f.reqUnless.k] === f.reqUnless.v) ? f.label + ' is required.' : '';
  if (f.pattern && !new RegExp(f.pattern).test(v)) return f.label + ' format is invalid' + (f.hint ? ' (' + f.hint + ')' : '') + '.';
  if (f.type === 'date') {
    if (isNaN(Date.parse(v))) return f.label + ' is not a valid date.';
    if (f.adult && localAge(v) < 18) return 'Applicant must be at least 18 years old.';
    if (f.notFuture && v > todayStr()) return f.label + ' cannot be in the future.';
  }
  return '';
}

function setErr(root, k, msg) {
  const m = $('[data-err="' + k + '"]', root); if (m) m.textContent = msg || '';
  const c = $('[data-k="' + k + '"]', root); if (c) c.classList.toggle('bad', !!msg);
}
function showErrors(root, errors) {
  $$('[data-err]', root).forEach(e => { e.textContent = ''; });
  $$('.bad', root).forEach(e => e.classList.remove('bad'));
  let first = null;
  Object.keys(errors || {}).forEach(k => {
    setErr(root, k, errors[k]);
    const c = $('[data-k="' + k + '"]', root) || $('[data-err="' + k + '"]', root);
    if (c && !first) first = c;
  });
  if (first) first.scrollIntoView({ block: 'center', behavior: 'smooth' });
}
function validateSpec(root, spec) {
  const data = readFields(root, spec), errors = {};
  spec.forEach(f => {
    if (f.type === 'file' || f.type === 'files') return;
    const m = checkField(f, data[f.k], data); if (m) errors[f.k] = m;
  });
  showErrors(root, errors);
  return { data, errors, ok: !Object.keys(errors).length };
}
/** Validates a field when the user leaves it (inline feedback). */
function wireBlurValidation(root, spec) {
  spec.forEach(f => {
    const el = $('[data-k="' + f.k + '"]', root);
    if (el) el.addEventListener('blur', () => setErr(root, f.k, checkField(f, el.value.trim(), readFields(root, spec))));
  });
}

/* ---------- files & downloads ---------- */
function readAsBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1] || '');
    r.onerror = () => rej(new Error('Could not read the file.'));
    r.readAsDataURL(file);
  });
}
function downloadBlob(name, mime, content) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function b64ToBlob(b64, mime) {
  const bin = atob(b64), arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}
/** CSV with BOM so Excel reads UTF-8; text columns use ="…" so leading zeros survive. */
function toCsv(headers, rows, textCols) {
  const q = (v, i) => {
    v = String(v == null ? '' : v);
    if (textCols && textCols.indexOf(i) >= 0 && v) return '"=""' + v.replace(/"/g, '""') + '"""';
    return '"' + v.replace(/"/g, '""') + '"';
  };
  const lines = [headers.map(h => q(h, -1)).join(',')];
  rows.forEach(r => lines.push(r.map(q).join(',')));
  return '﻿' + lines.join('\r\n');
}
function stamp() { return todayStr(); }
function loadXlsx() {
  return new Promise((res, rej) => {
    if (window.XLSX) return res(window.XLSX);
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload = () => res(window.XLSX); s.onerror = () => rej(new Error('Excel library failed to load. Use CSV instead.'));
    document.head.appendChild(s);
  });
}
/** Starts loading the Excel library in the background so the Excel button is instant. */
function preloadXlsx() { setTimeout(() => { loadXlsx().catch(() => {}); }, 1500); }

/** Shrinks phone photos before upload (max 1600 px, JPEG q0.82). PDFs and small images pass through. */
function compressImage(file) {
  if (file.type.indexOf('image/') !== 0 || file.size < 350 * 1024 || !window.createImageBitmap) return Promise.resolve(file);
  return createImageBitmap(file).then(bmp => {
    const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(bmp, 0, 0, c.width, c.height);
    return new Promise(res => c.toBlob(b => {
      if (!b || b.size >= file.size) return res(file);
      res(new File([b], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' }));
    }, 'image/jpeg', 0.82));
  }).catch(() => file);
}
async function downloadXlsx(name, headers, rows, sheet) {
  const X = await loadXlsx();
  const ws = X.utils.aoa_to_sheet([headers].concat(rows.map(r => r.map(String))));
  const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, sheet || 'Masterlist');
  X.writeFile(wb, name);
}
