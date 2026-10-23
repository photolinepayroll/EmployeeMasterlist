/**
 * Util.gs — sheet data access, validation, hashing, locking and audit logging.
 * Functions ending in "_" are private: the browser cannot call them.
 */

let SS_CACHE_ = null;

function db_() {
  if (!SS_CACHE_) {
    const id = getProp_('SHEET_ID');
    if (!id) throw new Error('System is not set up. Run setupSystem() first.');
    SS_CACHE_ = SpreadsheetApp.openById(id);
  }
  return SS_CACHE_;
}

function sh_(name) {
  const s = db_().getSheetByName(name);
  if (!s) throw new Error('Missing sheet: ' + name);
  return s;
}

function rootFolder_() {
  return DriveApp.getFolderById(getProp_('ROOT_FOLDER_ID'));
}

/** Per-execution read caches (a new doPost starts empty). Writes and lock_ clear them. */
let SHEET_MEMO_ = {};
let HEADER_MEMO_ = {};
const TARGETED_MIN_ROWS = 60;

function headers_(name) {
  if (!HEADER_MEMO_[name]) {
    const s = sh_(name);
    HEADER_MEMO_[name] = s.getRange(1, 1, 1, s.getLastColumn()).getValues()[0];
  }
  return HEADER_MEMO_[name];
}

/** Reads a sheet into an array of objects keyed by header. `_row` is the 1-based sheet row. */
function readAll_(name) {
  let values = SHEET_MEMO_[name];
  if (!values) {
    values = sh_(name).getDataRange().getDisplayValues();
    SHEET_MEMO_[name] = values;
  }
  const headers = values[0];
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const o = { _row: i + 1 };
    headers.forEach(function (h, j) { o[h] = unclean_(values[i][j]); });
    rows.push(o);
  }
  return rows;
}

/** First row whose `key` equals `value`. Large sheets read just the key column plus the matching row. */
function findBy_(name, key, value) {
  const v = String(value);
  const s = sh_(name);
  const lastRow = s.getLastRow();
  if (SHEET_MEMO_[name] || lastRow <= TARGETED_MIN_ROWS) {
    return readAll_(name).find(function (r) { return String(r[key]) === v; }) || null;
  }
  const headers = headers_(name);
  const ci = headers.indexOf(key);
  if (ci < 0) throw new Error('Missing column: ' + key);
  const col = s.getRange(2, ci + 1, lastRow - 1, 1).getDisplayValues();
  for (let i = 0; i < col.length; i++) {
    if (unclean_(col[i][0]) === v) {
      const vals = s.getRange(i + 2, 1, 1, headers.length).getDisplayValues()[0];
      const o = { _row: i + 2 };
      headers.forEach(function (h, j) { o[h] = unclean_(vals[j]); });
      return o;
    }
  }
  return null;
}

function appendObj_(name, cols, obj) {
  const s = sh_(name);
  const row = s.getLastRow() + 1;
  const range = s.getRange(row, 1, 1, cols.length);
  range.setNumberFormat('@');
  range.setValues([cols.map(function (c) { return clean_(obj[c]); })]);
  SHEET_MEMO_[name] = null;
  return row;
}

/** Updates only the keys present in `obj` on the given sheet row. */
function updateObj_(name, rowNum, obj) {
  const s = sh_(name);
  const headers = headers_(name);
  let lo = -1, hi = -1;
  headers.forEach(function (h, j) {
    if (Object.prototype.hasOwnProperty.call(obj, h)) { if (lo < 0) lo = j; hi = j; }
  });
  if (lo < 0) return;
  // Touch only the span of columns being changed, not the whole row.
  const range = s.getRange(rowNum, lo + 1, 1, hi - lo + 1);
  const current = range.getValues()[0];
  for (let j = lo; j <= hi; j++) {
    if (Object.prototype.hasOwnProperty.call(obj, headers[j])) current[j - lo] = clean_(obj[headers[j]]);
  }
  range.setNumberFormat('@');
  range.setValues([current]);
  SHEET_MEMO_[name] = null;
  if (name === SHEETS.EMP && REPORT_KEYS.some(function (k) { return Object.prototype.hasOwnProperty.call(obj, k); })) {
    cacheDropBig_('rpt_limited');
  }
}

/* CacheService values are capped at 100 KB, so larger JSON is split into chunks. Cache misses are always safe. */
const CACHE_CHUNK_ = 40000;
const CACHE_TTL_ = 1800;   // 30 min: bounds staleness after manual Sheet edits

function cachePutBig_(key, obj) {
  try {
    const str = JSON.stringify(obj), cache = CacheService.getScriptCache(), all = {};
    const n = Math.ceil(str.length / CACHE_CHUNK_);
    for (let i = 0; i < n; i++) all[key + '_' + i] = str.slice(i * CACHE_CHUNK_, (i + 1) * CACHE_CHUNK_);
    all[key] = String(n);
    cache.putAll(all, CACHE_TTL_);
  } catch (e) { console.warn('cache put failed: ' + e); }
}

function cacheGetBig_(key) {
  try {
    const cache = CacheService.getScriptCache();
    const n = Number(cache.get(key));
    if (!n) return null;
    const keys = [];
    for (let i = 0; i < n; i++) keys.push(key + '_' + i);
    const parts = cache.getAll(keys);
    let str = '';
    for (let i = 0; i < n; i++) {
      const p = parts[key + '_' + i];
      if (p == null) return null;
      str += p;
    }
    return JSON.parse(str);
  } catch (e) { return null; }
}

function cacheDropBig_(key) {
  try { CacheService.getScriptCache().remove(key); } catch (e) { /* ignore */ }
}

/** Neutralises spreadsheet formula injection and trims values. */
function clean_(v) {
  if (v === null || v === undefined) return '';
  let s = String(v).trim();
  if (s.length > 5000) s = s.slice(0, 5000);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}

function unclean_(v) {
  const s = String(v);
  return /^'[=+\-@]/.test(s) ? s.slice(1) : s;
}

function lock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  SHEET_MEMO_ = {};   // another execution may have written while we waited
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function audit_(actor, role, action, ref, details) {
  try {
    appendObj_(SHEETS.AUDIT, AUDIT_COLS, {
      Timestamp: nowIso_(),
      Actor: actor || '',
      Role: role || '',
      Action: action,
      Ref: ref || '',
      Details: details || ''
    });
  } catch (e) {
    console.error('Audit log failed: ' + e);
  }
}

function uuid_() {
  return Utilities.getUuid().replace(/-/g, '');
}

function sha256_(s) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s), Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

function tz_() {
  return Session.getScriptTimeZone() || 'Asia/Manila';
}

function nowIso_() {
  return Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd HH:mm:ss');
}

function todayIso_() {
  return Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd');
}

function addDaysIso_(days) {
  return Utilities.formatDate(new Date(Date.now() + days * 86400000), tz_(), 'yyyy-MM-dd HH:mm:ss');
}

function normEmail_(e) {
  return String(e || '').trim().toLowerCase();
}

function isTrue_(v) {
  return ['TRUE', 'YES', 'Y', '1', 'ACTIVE'].indexOf(String(v).trim().toUpperCase()) >= 0;
}

function esc_(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function safeName_(s) {
  return String(s || '').replace(/[^A-Za-z0-9 _.-]/g, '').trim().slice(0, 60) || 'file';
}

function fullName_(r) {
  let n = (r.LastName || '') + ', ' + (r.FirstName || '');
  if (r.MiddleName) n += ' ' + r.MiddleName;
  if (r.Suffix) n += ' ' + r.Suffix;
  return n.trim();
}

/** Base URL used in emailed links: the GitHub Pages site when set, else the Apps Script URL. */
function appUrl_() {
  return getProp_('FRONTEND_URL') || getProp_('APP_URL') || ScriptApp.getService().getUrl();
}

/** Builds a link to a frontend page, e.g. pageUrl_('apply', {t: token}). */
function pageUrl_(page, params) {
  const base = getProp_('FRONTEND_URL');
  if (!base) throw new Error('Frontend URL is not set. Ask the system owner to run setFrontendUrlNow() in Apps Script.');
  const q = Object.keys(params || {}).map(function (k) { return k + '=' + encodeURIComponent(params[k]); }).join('&');
  return base.replace(/\/+$/, '') + '/' + (page === 'login' ? 'index' : page) + '.html' + (q ? '?' + q : '');
}

/** Public logo for emails: served from the GitHub Pages site (docs/img/logo.png). */
function logoUrl_() {
  const base = getProp_('FRONTEND_URL');
  return base ? base.replace(/\/+$/, '') + '/img/logo.png' : '';
}

function companyName_() {
  return getProp_('COMPANY_NAME') || APP_NAME;
}

/** Reads dropdown lists from the Lists sheet (one list per column). */
function getLists_() {
  const values = sh_(SHEETS.LISTS).getDataRange().getDisplayValues();
  const headers = values[0];
  const lists = {};
  headers.forEach(function (h, j) {
    lists[h] = [];
    for (let i = 1; i < values.length; i++) {
      const v = String(values[i][j]).trim();
      if (v) lists[h].push(v);
    }
  });
  return lists;
}

function isValidDate_(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return false;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return d.getFullYear() === +m[1] && d.getMonth() === +m[2] - 1 && d.getDate() === +m[3];
}

function ageOn_(birth, todayStr) {
  const b = birth.split('-').map(Number);
  const t = todayStr.split('-').map(Number);
  let age = t[0] - b[0];
  if (t[1] < b[1] || (t[1] === b[1] && t[2] < b[2])) age--;
  return age;
}

/** Returns an error message for one field, or '' when valid. Mirrored in Client.html. */
function fieldError_(f, v, lists, partial) {
  if (!v) return (f.req && !partial) ? f.label + ' is required.' : '';
  if (f.max && v.length > f.max) return f.label + ' must be at most ' + f.max + ' characters.';
  if (f.pattern && !new RegExp(f.pattern).test(v)) {
    return f.label + ' format is invalid' + (f.hint ? ' (' + f.hint + ')' : '') + '.';
  }
  if (f.type === 'select') {
    const opts = f.options || lists[f.list] || [];
    if (opts.indexOf(v) < 0) return 'Please choose a valid ' + f.label + '.';
  }
  if (f.type === 'date') {
    if (!isValidDate_(v)) return f.label + ' is not a valid date.';
    const today = todayIso_();
    if (f.adult) {
      const age = ageOn_(v, today);
      if (age < 18) return 'Applicant must be at least 18 years old.';
      if (age > 100) return f.label + ' looks incorrect.';
    }
    if (f.notFuture && v > today) return f.label + ' cannot be in the future.';
  }
  return '';
}

/**
 * Validates `data` against a field spec. In partial mode required checks are
 * skipped and only keys present in `data` are checked.
 * @return {{clean: Object, errors: Object}}
 */
function validateFields_(spec, data, lists, partial) {
  const clean = {};
  const errors = {};
  data = data || {};
  spec.forEach(function (f) {
    if (f.type === 'file' || f.type === 'files') return;
    const present = Object.prototype.hasOwnProperty.call(data, f.k);
    if (!present && partial) return;
    const v = present && data[f.k] != null ? String(data[f.k]).trim() : '';
    const waived = f.reqUnless && String(data[f.reqUnless.k] || '').trim() === f.reqUnless.v;
    const err = fieldError_(f, v, lists, partial || waived);
    if (err) errors[f.k] = err;
    else clean[f.k] = v;
  });
  return { clean: clean, errors: errors };
}

function throwValidation_(errors) {
  throw new Error('VALIDATION:' + JSON.stringify(errors));
}

function hasKeys_(o) {
  return Object.keys(o).length > 0;
}

function parseDocs_(json) {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    return [];
  }
}

function fileMeta_(id) {
  if (!id) return null;
  try {
    const f = DriveApp.getFileById(id);
    return { id: id, name: f.getDescription() || f.getName() };
  } catch (e) {
    return { id: id, name: '(file missing)' };
  }
}

function filesInfo_(emp) {
  const out = {};
  Object.keys(FILE_FIELDS).forEach(function (k) {
    out[k] = MULTI_FILE_FIELDS.indexOf(k) >= 0 ? parseDocs_(emp[k]) : fileMeta_(emp[k]);
  });
  return out;
}

/** Every Drive file id attached to a record (used to authorise HR downloads). */
function fileIds_(emp) {
  let ids = [];
  Object.keys(FILE_FIELDS).forEach(function (k) {
    if (MULTI_FILE_FIELDS.indexOf(k) >= 0) ids = ids.concat(parseDocs_(emp[k]).map(function (d) { return d.id; }));
    else if (emp[k]) ids.push(emp[k]);
  });
  return ids;
}

function sendMail_(to, subject, html) {
  MailApp.sendEmail({ to: to, subject: subject, htmlBody: html, name: companyName_() });
}

/** Branded email layout: table-based, inline CSS only, 600px card that shrinks on phones. */
function mailShell_(title, bodyHtml) {
  const font = 'font-family:Arial,Helvetica,sans-serif;';
  return '<div style="background:#f0f4ff;padding:24px 12px;' + font + '">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;border-collapse:separate;overflow:hidden">' +
    '<tr><td style="padding:24px 28px 16px;border-bottom:4px solid #1428e6">' +
    '<img src="' + logoUrl_() + '" width="200" height="60" alt="' + esc_(companyName_()) + '" style="display:block;border:0;outline:none;height:auto;max-width:200px">' +
    '</td></tr>' +
    '<tr><td style="padding:24px 28px 8px;' + font + 'color:#1f2937;font-size:16px;line-height:1.5">' +
    '<h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;color:#111827">' + esc_(title) + '</h1>' + bodyHtml +
    '</td></tr>' +
    '<tr><td style="padding:16px 28px 24px;' + font + 'font-size:12px;line-height:1.5;color:#4b5563;border-top:1px solid #e5e7eb">' +
    '<b style="color:#1428e6">' + esc_(companyName_()) + '</b> &middot; <i style="color:#c8161d">plenty to smile about!</i><br>' +
    'This is an automated message. Do not forward this email; links and codes in it are personal to you.' +
    '</td></tr></table></div>';
}

/** Bulletproof call-to-action button plus the raw link underneath as a fallback. */
function mailButton_(label, url) {
  return '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0 10px"><tr>' +
    '<td style="background:#1428e6;border-radius:8px"><a href="' + esc_(url) + '" style="display:inline-block;padding:14px 28px;color:#ffffff;font-weight:bold;font-size:16px;text-decoration:none;font-family:Arial,Helvetica,sans-serif">' + esc_(label) + '</a></td>' +
    '</tr></table>' +
    '<p style="margin:0 0 12px;font-size:12px;color:#4b5563;word-break:break-all">Button not working? Copy this link into your browser:<br>' +
    '<a href="' + esc_(url) + '" style="color:#1428e6">' + esc_(url) + '</a></p>';
}

/** One-time code shown large in a light box. */
function mailCode_(code) {
  return '<p style="margin:16px 0;padding:16px;background:#eef2ff;border:1px solid #c7d2fe;border-radius:8px;text-align:center;font-family:Consolas,Menlo,monospace;font-size:32px;letter-spacing:8px;font-weight:bold;color:#1428e6">' + esc_(code) + '</p>';
}
