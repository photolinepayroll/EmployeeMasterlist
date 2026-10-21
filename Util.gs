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

/** Reads a sheet into an array of objects keyed by header. `_row` is the 1-based sheet row. */
function readAll_(name) {
  const values = sh_(name).getDataRange().getDisplayValues();
  const headers = values[0];
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const o = { _row: i + 1 };
    headers.forEach(function (h, j) { o[h] = unclean_(values[i][j]); });
    rows.push(o);
  }
  return rows;
}

function findBy_(name, key, value) {
  const v = String(value);
  return readAll_(name).find(function (r) { return String(r[key]) === v; }) || null;
}

function appendObj_(name, cols, obj) {
  const s = sh_(name);
  const row = s.getLastRow() + 1;
  const range = s.getRange(row, 1, 1, cols.length);
  range.setNumberFormat('@');
  range.setValues([cols.map(function (c) { return clean_(obj[c]); })]);
  return row;
}

/** Updates only the keys present in `obj` on the given sheet row. */
function updateObj_(name, rowNum, obj) {
  const s = sh_(name);
  const lastCol = s.getLastColumn();
  const headers = s.getRange(1, 1, 1, lastCol).getValues()[0];
  const range = s.getRange(rowNum, 1, 1, lastCol);
  const current = range.getValues()[0];
  headers.forEach(function (h, j) {
    if (Object.prototype.hasOwnProperty.call(obj, h)) current[j] = clean_(obj[h]);
  });
  range.setNumberFormat('@');
  range.setValues([current]);
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
  const base = appUrl_();
  const q = Object.keys(params || {}).map(function (k) { return k + '=' + encodeURIComponent(params[k]); }).join('&');
  if (getProp_('FRONTEND_URL')) return base.replace(/\/+$/, '') + '/' + page + '.html' + (q ? '?' + q : '');
  return base + '?page=' + page + (q ? '&' + q : '');
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
    const err = fieldError_(f, v, lists, partial);
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
  return {
    MedicalFileId: fileMeta_(emp.MedicalFileId),
    NBIFileId: fileMeta_(emp.NBIFileId),
    OtherDocs: parseDocs_(emp.OtherDocs)
  };
}

function sendMail_(to, subject, html) {
  MailApp.sendEmail({ to: to, subject: subject, htmlBody: html, name: companyName_() + ' HR' });
}

function mailShell_(title, bodyHtml) {
  return '<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#1f2937">' +
    '<h2 style="color:#0f4c81;margin-bottom:4px">' + esc_(companyName_()) + '</h2>' +
    '<h3 style="margin-top:0">' + esc_(title) + '</h3>' + bodyHtml +
    '<p style="color:#6b7280;font-size:12px;margin-top:24px">This is an automated message from the HR Employee Masterlist system. ' +
    'Do not forward this email; links in it are personal to you.</p></div>';
}
