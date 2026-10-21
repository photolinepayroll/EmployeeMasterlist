/**
 * Applicant.gs — public functions used by the invite-link form.
 * Authorisation = a valid, unexpired invite token for an entry still editable.
 */

function inviteByToken_(token) {
  if (!token || String(token).length < 32) throw new Error('This link is not valid.');
  const inv = findBy_(SHEETS.INV, 'TokenHash', sha256_(token));
  if (!inv || inv.Status !== 'ACTIVE') throw new Error('This link is no longer active. Please contact HR.');
  if (inv.ExpiresAt < nowIso_()) throw new Error('This link has expired. Please ask HR to send a new one.');
  const emp = findBy_(SHEETS.EMP, 'AppID', inv.AppID);
  if (!emp) throw new Error('This link is not valid.');
  return { inv: inv, emp: emp };
}

function getApplicationByToken(token) {
  const r = inviteByToken_(token);
  const emp = r.emp;
  const editable = EDITABLE_BY_APPLICANT.indexOf(emp.Status) >= 0;
  const data = {};
  APPLICANT_FIELDS.forEach(function (f) {
    if (f.type !== 'file' && f.type !== 'files') data[f.k] = emp[f.k] || '';
  });
  if (!data.Email) data.Email = r.inv.Email;
  if (!data.Branch) data.Branch = r.inv.Branch;
  return {
    status: emp.Status,
    editable: editable,
    invitedName: r.inv.Name,
    remarks: emp.Status === STATUS.RETURNED ? emp.Remarks : '',
    data: data,
    files: filesInfo_(emp),
    consent: emp.PrivacyConsent === 'YES',
    spec: APPLICANT_FIELDS,
    steps: APPLY_STEPS,
    lists: getLists_(),
    company: companyName_(),
    limits: { maxBytes: MAX_FILE_BYTES, maxOther: MAX_OTHER_DOCS }
  };
}

/** Saves a draft of the text fields without changing status (partial validation). */
function saveDraft(token, data) {
  return lock_(function () {
    const r = inviteByToken_(token);
    if (EDITABLE_BY_APPLICANT.indexOf(r.emp.Status) < 0) throw new Error('This form can no longer be edited.');
    const v = validateFields_(APPLICANT_FIELDS, data, getLists_(), true);
    const toSave = v.clean;
    toSave.UpdatedAt = nowIso_();
    updateObj_(SHEETS.EMP, r.emp._row, toSave);
    return { saved: true, errors: v.errors };
  });
}

function applicantFolder_(emp) {
  if (emp.FolderId) {
    try { return DriveApp.getFolderById(emp.FolderId); } catch (e) { /* recreate below */ }
  }
  const f = rootFolder_().createFolder(emp.AppID + '_' + safeName_(emp.LastName || 'applicant'));
  updateObj_(SHEETS.EMP, emp._row, { FolderId: f.getId() });
  return f;
}

/**
 * Uploads one document. field = MedicalFileId | NBIFileId | OtherDocs.
 * Single-file fields replace (and trash) any earlier upload.
 */
function uploadFile(token, field, fileName, mime, base64) {
  if (!FILE_FIELDS[field]) throw new Error('Unknown upload field.');
  if (!ALLOWED_MIME[mime]) throw new Error('Only PDF, JPG or PNG files are allowed.');
  const bytes = Utilities.base64Decode(base64 || '');
  if (!bytes.length) throw new Error('The file is empty.');
  if (bytes.length > MAX_FILE_BYTES) throw new Error('File is larger than 5 MB.');
  if (!magicOk_(bytes, mime)) throw new Error('File content does not match its type.');

  return lock_(function () {
    const r = inviteByToken_(token);
    if (EDITABLE_BY_APPLICANT.indexOf(r.emp.Status) < 0) throw new Error('This form can no longer be edited.');
    const emp = r.emp;
    const folder = applicantFolder_(emp);
    const display = safeName_(fileName);
    const stored = FILE_FIELDS[field] + '_' + Date.now() + '.' + ALLOWED_MIME[mime];
    const file = folder.createFile(Utilities.newBlob(bytes, mime, stored));
    file.setDescription(display);
    file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);

    if (field === 'OtherDocs') {
      const docs = parseDocs_(emp.OtherDocs);
      if (docs.length >= MAX_OTHER_DOCS) {
        file.setTrashed(true);
        throw new Error('Maximum of ' + MAX_OTHER_DOCS + ' other documents.');
      }
      docs.push({ id: file.getId(), name: display });
      updateObj_(SHEETS.EMP, emp._row, { OtherDocs: JSON.stringify(docs), UpdatedAt: nowIso_() });
      return { docs: docs };
    }
    if (emp[field]) trashQuiet_(emp[field]);
    const o = {}; o[field] = file.getId(); o.UpdatedAt = nowIso_();
    updateObj_(SHEETS.EMP, emp._row, o);
    return { file: { id: file.getId(), name: display } };
  });
}

function removeOtherDoc(token, fileId) {
  return lock_(function () {
    const r = inviteByToken_(token);
    if (EDITABLE_BY_APPLICANT.indexOf(r.emp.Status) < 0) throw new Error('This form can no longer be edited.');
    const docs = parseDocs_(r.emp.OtherDocs);
    const keep = docs.filter(function (d) { return d.id !== fileId; });
    if (keep.length === docs.length) throw new Error('Document not found.');
    trashQuiet_(fileId);
    updateObj_(SHEETS.EMP, r.emp._row, { OtherDocs: JSON.stringify(keep), UpdatedAt: nowIso_() });
    return { docs: keep };
  });
}

function trashQuiet_(id) {
  try { DriveApp.getFileById(id).setTrashed(true); } catch (e) { /* already gone */ }
}

function magicOk_(bytes, mime) {
  const b = bytes.slice(0, 4).map(function (x) { return x & 0xff; });
  if (mime === 'application/pdf') return b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46;
  if (mime === 'image/png') return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  if (mime === 'image/jpeg') return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  return false;
}

function submitApplication(token, data, consent) {
  return lock_(function () {
    const r = inviteByToken_(token);
    const emp = r.emp;
    if (EDITABLE_BY_APPLICANT.indexOf(emp.Status) < 0) throw new Error('This form was already submitted.');
    if (consent !== true) throw new Error('VALIDATION:' + JSON.stringify({ consent: 'You must accept the Data Privacy notice.' }));

    const v = validateFields_(APPLICANT_FIELDS, data, getLists_(), false);
    const errors = v.errors;
    APPLICANT_FIELDS.forEach(function (f) {
      if (f.type === 'file' && f.req && !emp[f.k]) errors[f.k] = f.label + ' is required.';
    });
    // The same person must not be submitted twice under different invites.
    const dup = readAll_(SHEETS.EMP).find(function (e) {
      return e.AppID !== emp.AppID && e.Status !== STATUS.CANCELLED &&
        e.LastName.toLowerCase() === (v.clean.LastName || '').toLowerCase() &&
        e.FirstName.toLowerCase() === (v.clean.FirstName || '').toLowerCase() &&
        e.Birthdate === v.clean.Birthdate;
    });
    if (dup) errors.LastName = 'An entry for this person already exists. Contact HR.';
    if (hasKeys_(errors)) throwValidation_(errors);

    const u = v.clean;
    u.Status = STATUS.PENDING;
    u.PrivacyConsent = 'YES';
    u.SubmittedAt = nowIso_();
    u.UpdatedAt = nowIso_();
    u.Remarks = '';
    updateObj_(SHEETS.EMP, emp._row, u);
    audit_(emp.Email || r.inv.Email, 'APPLICANT', 'SUBMITTED', emp.AppID, '');
    notifyHr_(emp.AppID, fullName_(u));
    return { ok: true, appId: emp.AppID };
  });
}

function notifyHr_(appId, name) {
  try {
    readAll_(SHEETS.USERS).filter(function (u) { return u.Role === ROLES.HR && isTrue_(u.Active); })
      .forEach(function (u) {
        sendMail_(u.Email, 'New application to review: ' + name,
          mailShell_('Application submitted',
            '<p><b>' + esc_(name) + '</b> (' + esc_(appId) + ') submitted an application for review.</p>' +
            '<p><a href="' + esc_(pageUrl_('admin')) + '">Open HR Admin</a></p>'));
      });
  } catch (e) { console.error('notifyHr_ failed: ' + e); }
}
