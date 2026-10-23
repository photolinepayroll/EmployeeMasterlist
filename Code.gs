/**
 * Code.gs — JSON API (doPost) for the GitHub Pages frontend, plus a doGet that
 * forwards old links (?page=apply&t=...) to the public site.
 */

function doGet(e) {
  const p = (e && e.parameter) || {};
  const base = getProp_('FRONTEND_URL');
  if (!base) {
    return HtmlService.createHtmlOutput('<p style="font-family:sans-serif">The frontend URL is not configured yet. Please contact HR.</p>');
  }
  const pages = { apply: 'apply', admin: 'admin', reports: 'reports', login: 'index' };
  const page = pages[String(p.page || 'login').toLowerCase()] || 'index';
  const t = String(p.t || '').replace(/[^A-Za-z0-9]/g, '');
  const target = base.replace(/\/+$/, '') + '/' + page + '.html' + (t ? '?t=' + t : '');
  const safe = esc_(target);
  return HtmlService.createHtmlOutput(
    '<!DOCTYPE html><html><head><meta charset="utf-8"><base target="_top">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1"></head>' +
    '<body style="font-family:system-ui,sans-serif;text-align:center;padding:40px 16px">' +
    '<p>This form has moved.</p><p><a href="' + safe + '" target="_top" style="background:#0369a1;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600">Open the form</a></p>' +
    '<script>try{window.top.location.replace(' + JSON.stringify(target).split('<').join('') + ');}catch(x){}</script>' +
    '</body></html>').setTitle(companyName_());
}

/* ---------- JSON API for the GitHub Pages frontend ---------- */

/** Only these functions can be called from the browser via doPost. Everything else stays private. */
const API_ALLOWED_ = [
  'requestLoginCode', 'verifyLoginCode', 'logout', 'whoAmI',
  'getApplicationByToken', 'saveDraft', 'uploadFile', 'removeDoc', 'submitApplication',
  'adminBootstrap', 'listApplications', 'getApplication', 'getFile', 'saveRecord',
  'approveApplication', 'returnApplication', 'setEmploymentStatus', 'exportFullMasterlist', 'listUsers', 'upsertUser',
  'createInvite', 'resendInvite', 'revokeInvite',
  'getLimitedMasterlist', 'logDownload'
];

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const fn = String(body.fn || '');
    const args = Array.isArray(body.args) ? body.args : [];
    if (API_ALLOWED_.indexOf(fn) < 0) return json_({ ok: false, error: 'Unknown function.' });
    const result = globalThis[fn].apply(null, args);
    return json_({ ok: true, data: result === undefined ? null : result });
  } catch (err) {
    const msg = String((err && err.message) || err).replace(/^Error:\s*/, '');
    const out = { ok: false, error: msg };
    const v = msg.indexOf('VALIDATION:');
    if (v >= 0) {
      try { out.fields = JSON.parse(msg.slice(v + 11)); out.error = 'Please fix the highlighted fields.'; } catch (x) { /* keep raw */ }
    }
    if (msg.indexOf('SESSION:') >= 0) { out.session = true; out.error = msg.replace('SESSION:', '').trim(); }
    return json_(out);
  }
}
