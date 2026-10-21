/**
 * Admin.gs — HR Admin only: review, edit, approve/return, export and users.
 */


function adminBootstrap(token) {
  requireRole_(token, HR_ONLY);
  return {
    applicantSpec: APPLICANT_FIELDS,
    adminSpec: ADMIN_FIELDS,
    steps: APPLY_STEPS,
    lists: getLists_(),
    roles: ALL_ROLES,
    accountTypes: ACCOUNT_TYPES
  };
}

function listApplications(token) {
  requireRole_(token, HR_ONLY);
  return readAll_(SHEETS.EMP).map(function (r) {
    const hasName = r.LastName || r.FirstName;
    return {
      AppID: r.AppID, Status: r.Status, BioID: r.BioID, Name: hasName ? fullName_(r) : '',
      Email: r.Email, Branch: r.Branch, SubmittedAt: r.SubmittedAt, UpdatedAt: r.UpdatedAt, DateHired: r.DateHired
    };
  }).reverse();
}

function getApplication(token, appId) {
  const s = requireRole_(token, HR_ONLY);
  const emp = findBy_(SHEETS.EMP, 'AppID', appId);
  if (!emp) throw new Error('Record not found.');
  audit_(s.email, s.role, 'VIEW_RECORD', appId, '');
  const rec = {};
  APPLICANT_FIELDS.concat(ADMIN_FIELDS).forEach(function (f) {
    if (f.type !== 'file' && f.type !== 'files') rec[f.k] = emp[f.k] || '';
  });
  return {
    AppID: emp.AppID, Status: emp.Status, Remarks: emp.Remarks, SubmittedAt: emp.SubmittedAt,
    ReviewedBy: emp.ReviewedBy, ReviewedAt: emp.ReviewedAt, record: rec, files: filesInfo_(emp)
  };
}

/** Streams a document to HR as base64 (Drive files themselves stay private). */
function getFile(token, appId, fileId) {
  const s = requireRole_(token, HR_ONLY);
  const emp = findBy_(SHEETS.EMP, 'AppID', appId);
  if (!emp) throw new Error('Record not found.');
  const ids = [emp.MedicalFileId, emp.NBIFileId].concat(parseDocs_(emp.OtherDocs).map(function (d) { return d.id; }));
  if (ids.indexOf(fileId) < 0) throw new Error('File does not belong to this record.');
  const f = DriveApp.getFileById(fileId);
  audit_(s.email, s.role, 'OPEN_FILE', appId, f.getDescription());
  return { name: f.getDescription() || f.getName(), mime: f.getMimeType(), base64: Utilities.base64Encode(f.getBlob().getBytes()) };
}

/**
 * Saves HR edits. `data` may contain applicant fields (corrections) and admin fields.
 * Partial validation: nothing is required until approval.
 */
function saveRecord(token, appId, data) {
  const s = requireRole_(token, HR_ONLY);
  return lock_(function () {
    const emp = findBy_(SHEETS.EMP, 'AppID', appId);
    if (!emp) throw new Error('Record not found.');
    const lists = getLists_();
    const v1 = validateFields_(APPLICANT_FIELDS, data, lists, true);
    const v2 = validateFields_(ADMIN_FIELDS, data, lists, true);
    const errors = Object.assign({}, v1.errors, v2.errors);
    const out = Object.assign({}, v1.clean, v2.clean);
    if (out.BioID) {
      const clash = bioClash_(out.BioID, appId);
      if (clash) errors.BioID = clash;
    }
    if (hasKeys_(errors)) throwValidation_(errors);
    out.UpdatedAt = nowIso_();
    updateObj_(SHEETS.EMP, emp._row, out);
    audit_(s.email, s.role, 'RECORD_SAVED', appId, Object.keys(out).join(','));
    return true;
  });
}

/** Returns an error message when the Bio ID is already used by another record, else ''. */
function bioClash_(bioId, appId) {
  const clash = readAll_(SHEETS.EMP).find(function (e) {
    return e.AppID !== appId && e.BioID && e.BioID.toLowerCase() === bioId.toLowerCase();
  });
  return clash ? 'Bio ID ' + bioId + ' is already used by ' + clash.AppID + '.' : '';
}

function approveApplication(token, appId, data) {
  const s = requireRole_(token, HR_ONLY);
  return lock_(function () {
    const emp = findBy_(SHEETS.EMP, 'AppID', appId);
    if (!emp) throw new Error('Record not found.');
    if ([STATUS.PENDING, STATUS.APPROVED].indexOf(emp.Status) < 0) throw new Error('Only submitted applications can be approved.');
    const lists = getLists_();
    const merged = {};
    APPLICANT_FIELDS.concat(ADMIN_FIELDS).forEach(function (f) {
      if (f.type === 'file' || f.type === 'files') return;
      merged[f.k] = data && Object.prototype.hasOwnProperty.call(data, f.k) ? data[f.k] : emp[f.k];
    });
    const v1 = validateFields_(APPLICANT_FIELDS, merged, lists, false);
    const v2 = validateFields_(ADMIN_FIELDS, merged, lists, false);
    const errors = Object.assign({}, v1.errors, v2.errors);
    if (v2.clean.BioID) {
      const clash = bioClash_(v2.clean.BioID, appId);
      if (clash) errors.BioID = clash;
    }
    if (hasKeys_(errors)) throwValidation_(errors);

    const out = Object.assign({}, v1.clean, v2.clean, {
      Status: STATUS.APPROVED, ReviewedBy: s.email, ReviewedAt: nowIso_(), Remarks: '', UpdatedAt: nowIso_()
    });
    updateObj_(SHEETS.EMP, emp._row, out);
    try {
      if (emp.FolderId) DriveApp.getFolderById(emp.FolderId).setName(out.BioID + '_' + safeName_(out.LastName));
    } catch (e) { console.error('Folder rename failed: ' + e); }
    audit_(s.email, s.role, 'APPROVED', appId, out.BioID);
    return true;
  });
}

function returnApplication(token, appId, remarks) {
  const s = requireRole_(token, HR_ONLY);
  remarks = clean_(remarks);
  if (!remarks) throw new Error('Enter remarks telling the applicant what to fix.');
  return lock_(function () {
    const emp = findBy_(SHEETS.EMP, 'AppID', appId);
    if (!emp || emp.Status !== STATUS.PENDING) throw new Error('Only pending applications can be returned.');
    updateObj_(SHEETS.EMP, emp._row, { Status: STATUS.RETURNED, Remarks: remarks, ReviewedBy: s.email, ReviewedAt: nowIso_(), UpdatedAt: nowIso_() });
    const inv = readAll_(SHEETS.INV).filter(function (r) { return r.AppID === appId; }).pop();
    if (inv) {
      const newTok = uuid_() + uuid_();
      updateObj_(SHEETS.INV, inv._row, { TokenHash: sha256_(newTok), ExpiresAt: addDaysIso_(INVITE_DAYS), Status: 'ACTIVE' });
      sendMail_(inv.Email, 'Please update your employee information form',
        mailShell_('Action needed',
          '<p>HR reviewed your form and needs corrections:</p><blockquote style="border-left:4px solid #f59e0b;margin:0;padding:6px 12px;background:#fffbeb">' +
          esc_(remarks) + '</blockquote><p><a href="' + esc_(pageUrl_('apply', { t: newTok })) + '">Open my form</a></p>'));
    }
    audit_(s.email, s.role, 'RETURNED', appId, remarks);
    return true;
  });
}

/** Full masterlist (all approved employees, all fields except file ids) as rows for CSV/Excel. */
function exportFullMasterlist(token) {
  const s = requireRole_(token, HR_ONLY);
  const plain = APPLICANT_FIELDS.filter(function (f) { return f.type !== 'file' && f.type !== 'files'; });
  const cols = ADMIN_FIELDS.slice(0, 3).concat(plain, ADMIN_FIELDS.slice(3));
  const rows = readAll_(SHEETS.EMP).filter(function (r) { return r.Status === STATUS.APPROVED; })
    .map(function (r) { return cols.map(function (f) { return r[f.k] || ''; }); });
  audit_(s.email, s.role, 'EXPORT_FULL', '', rows.length + ' rows');
  return { headers: cols.map(function (f) { return f.label; }), rows: rows };
}

function listUsers(token) {
  requireRole_(token, HR_ONLY);
  return readAll_(SHEETS.USERS).map(function (u) { return { Email: u.Email, Role: u.Role, Active: isTrue_(u.Active) }; });
}

function upsertUser(token, email, role, active) {
  const s = requireRole_(token, HR_ONLY);
  email = normEmail_(email);
  if (!new RegExp(PATTERNS.email).test(email)) throw new Error('Invalid email.');
  if (ALL_ROLES.indexOf(role) < 0) throw new Error('Invalid role.');
  return lock_(function () {
    const existing = findBy_(SHEETS.USERS, 'Email', email);
    if (existing) {
      if (email === s.email && (!active || role !== ROLES.HR)) throw new Error('You cannot remove your own HR access.');
      updateObj_(SHEETS.USERS, existing._row, { Role: role, Active: active ? 'TRUE' : 'FALSE' });
    } else {
      appendObj_(SHEETS.USERS, USER_COLS, { Email: email, Role: role, Active: active ? 'TRUE' : 'FALSE', AddedBy: s.email, AddedAt: nowIso_() });
    }
    audit_(s.email, s.role, 'USER_UPSERT', email, role + (active ? '' : ' (inactive)'));
    return true;
  });
}
