/**
 * Setup.gs — run setupSystem() ONCE from the Apps Script editor.
 * Creates the private Sheet database, tabs, Drive root folder and the first HR admin.
 */

function setupSystem() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('SHEET_ID')) {
    throw new Error('Already set up. Delete Script Properties SHEET_ID/ROOT_FOLDER_ID only if you really want to start over.');
  }
  const owner = normEmail_(Session.getEffectiveUser().getEmail());
  const ss = SpreadsheetApp.create('Employee Masterlist DB (PRIVATE)');
  props.setProperty('SHEET_ID', ss.getId());
  SS_CACHE_ = ss;

  const defs = [
    [SHEETS.EMP, EMP_COLS],
    [SHEETS.INV, INV_COLS],
    [SHEETS.USERS, USER_COLS],
    [SHEETS.AUDIT, AUDIT_COLS],
    [SHEETS.LISTS, LIST_COLS]
  ];
  defs.forEach(function (d, i) {
    const s = i === 0 ? ss.getSheets()[0].setName(d[0]) : ss.insertSheet(d[0]);
    s.getRange(1, 1, s.getMaxRows(), d[1].length).setNumberFormat('@');
    s.getRange(1, 1, 1, d[1].length).setValues([d[1]]).setFontWeight('bold').setBackground('#0f4c81').setFontColor('#ffffff');
    s.setFrozenRows(1);
  });

  const lists = sh_(SHEETS.LISTS);
  LIST_COLS.forEach(function (c, j) {
    const vals = DEFAULT_LISTS[c].map(function (v) { return [v]; });
    if (vals.length) lists.getRange(2, j + 1, vals.length, 1).setValues(vals);
  });

  appendObj_(SHEETS.USERS, USER_COLS, { Email: owner, Role: ROLES.HR, Active: 'TRUE', AddedBy: 'setup', AddedAt: nowIso_() });

  const folder = DriveApp.createFolder('Masterlist_Files (PRIVATE)');
  props.setProperty('ROOT_FOLDER_ID', folder.getId());

  // Lock the sheet so only the owner can edit it directly.
  ss.getSheets().forEach(function (s) {
    try {
      const p = s.protect().setDescription('Owner only');
      p.removeEditors(p.getEditors());
    } catch (e) { console.warn('Could not protect ' + s.getName() + ': ' + e); }
  });

  audit_('setup', ROLES.HR, 'SETUP', '', 'System created by ' + owner);
  console.log('Sheet: ' + ss.getUrl());
  console.log('Folder: ' + folder.getUrl());
  console.log('Next: Deploy > New deployment > Web app (Execute as: Me, Access: Anyone), then run saveAppUrl() or set APP_URL.');
}

/** Run after deploying so invite emails carry the right link. */
function saveAppUrl() {
  const url = ScriptApp.getService().getUrl();
  PropertiesService.getScriptProperties().setProperty('APP_URL', url);
  console.log('APP_URL = ' + url);
}

function setCompanyName(name) {
  PropertiesService.getScriptProperties().setProperty('COMPANY_NAME', String(name));
}

/** Paste the deployed /exec URL here (the editor's saveAppUrl() only returns the /dev test URL). */
function setAppUrl(url) {
  url = String(url || '').trim();
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(url)) throw new Error('Use the Web app URL that ends in /exec');
  PropertiesService.getScriptProperties().setProperty('APP_URL', url);
  console.log('APP_URL = ' + url);
}

/** One-click version for the editor: stores the live /exec URL of deployment "v1". */
function setAppUrlNow() {
  setAppUrl('https://script.google.com/macros/s/AKfycbxPvG_kKGLYBR3HzSJoZ6_jcctfnkPJ_jVMWcKV41JYEbPS28LVP39dKSE2EQZyGpI/exec');
}

/** Stores the GitHub Pages base URL used in emailed links, e.g. https://user.github.io/employee-masterlist */
function setFrontendUrl(url) {
  url = String(url || '').trim().replace(/\/+$/, '');
  if (!/^https:\/\/[^/\s]+(\/[^\s]*)?$/.test(url)) throw new Error('Enter the https:// frontend URL');
  PropertiesService.getScriptProperties().setProperty('FRONTEND_URL', url);
  console.log('FRONTEND_URL = ' + url);
}

/** One-click version for the editor: points emailed links at the GitHub Pages site. */
function setFrontendUrlNow() {
  setFrontendUrl('https://photolinepayroll.github.io/EmployeeMasterlist');
}

/** Run once: adds a "System" tab to the database Sheet with clickable links to the script, API and website. */
function addSystemTab() {
  const ss = db_();
  let s = ss.getSheetByName('System');
  if (!s) s = ss.insertSheet('System');
  s.clear();
  const rows = [
    ['Item', 'Link / Note'],
    ['Apps Script editor (code)', 'https://script.google.com/d/' + ScriptApp.getScriptId() + '/edit'],
    ['Web app API (/exec)', getProp_('APP_URL') || ''],
    ['Staff website (GitHub Pages)', getProp_('FRONTEND_URL') || '(run setFrontendUrlNow)'],
    ['Drive folder (documents)', 'https://drive.google.com/drive/folders/' + getProp_('ROOT_FOLDER_ID')],
    ['Note', 'Keep this Sheet and the Drive folder private. Do not share them with staff.']
  ];
  s.getRange(1, 1, rows.length, 2).setValues(rows);
  s.getRange(1, 1, 1, 2).setFontWeight('bold').setBackground('#0f4c81').setFontColor('#ffffff');
  s.getRange(2, 1, rows.length - 1, 1).setFontWeight('bold');
  s.setColumnWidth(1, 240); s.setColumnWidth(2, 640);
  for (let r = 2; r <= 5; r++) {
    const v = String(rows[r - 1][1]);
    if (/^https:\/\//.test(v)) {
      s.getRange(r, 2).setRichTextValue(SpreadsheetApp.newRichTextValue().setText(v).setLinkUrl(v).build());
    }
  }
  console.log('System tab ready: ' + ss.getUrl());
}
