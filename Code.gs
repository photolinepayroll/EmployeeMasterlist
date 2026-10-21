/**
 * Code.gs — web app entry point and page router.
 * Pages: ?page=apply&t=<token> | login (default) | admin | reports
 */

function doGet(e) {
  const p = (e && e.parameter) || {};
  const page = String(p.page || 'login').toLowerCase();
  const allowed = { apply: 'Apply', login: 'Login', admin: 'AdminPage', reports: 'ReportsPage' };
  const file = allowed[page] || 'Login';

  const t = HtmlService.createTemplateFromFile(file);
  t.appName = companyName_();
  t.baseUrl = appUrl_();
  t.inviteToken = page === 'apply' ? String(p.t || '') : '';
  return t.evaluate()
    .setTitle(companyName_() + ' — ' + file)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

/* ---------- JSON API for the GitHub Pages frontend ---------- */

/** Only these functions can be called from the browser via doPost. Everything else stays private. */
const API_ALLOWED_ = [
  'requestLoginCode', 'verifyLoginCode', 'logout', 'whoAmI',
  'getApplicationByToken', 'saveDraft', 'uploadFile', 'removeOtherDoc', 'submitApplication',
  'adminBootstrap', 'listApplications', 'getApplication', 'getFile', 'saveRecord',
  'approveApplication', 'returnApplication', 'exportFullMasterlist', 'listUsers', 'upsertUser',
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
