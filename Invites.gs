/**
 * Invites.gs — HR creates single-person invite links for new hires.
 * Only the SHA-256 hash of each token is stored.
 */

function createInvite(sessionToken, info) {
  const s = requireRole_(sessionToken, [ROLES.HR]);
  info = info || {};
  const email = normEmail_(info.email);
  const name = clean_(info.name).slice(0, 100);
  const branch = clean_(info.branch).slice(0, 80);
  if (!new RegExp(PATTERNS.email).test(email)) throw new Error('Enter a valid applicant email.');
  if (!name) throw new Error('Enter the applicant name.');

  return lock_(function () {
    const appId = 'APP-' + Utilities.formatDate(new Date(), tz_(), 'yyMMdd') + '-' + uuid_().slice(0, 5).toUpperCase();
    const token = uuid_() + uuid_();
    const link = pageUrl_('apply', { t: token });

    appendObj_(SHEETS.INV, INV_COLS, {
      TokenHash: sha256_(token), AppID: appId, Email: email, Name: name, Branch: branch,
      CreatedBy: s.email, CreatedAt: nowIso_(), ExpiresAt: addDaysIso_(INVITE_DAYS), Status: 'ACTIVE'
    });
    appendObj_(SHEETS.EMP, EMP_COLS, {
      AppID: appId, Status: STATUS.INVITED, Email: email, Branch: branch, UpdatedAt: nowIso_()
    });
    emailInvite_(email, name, link);
    audit_(s.email, s.role, 'INVITE_CREATED', appId, email);
    return { appId: appId, link: link };
  });
}

function emailInvite_(email, name, link) {
  sendMail_(email, companyName_() + ': complete your employee information form',
    mailShell_('Welcome, ' + name,
      '<p>Please complete your employee information form. Have these ready:</p>' +
      '<ul style="margin:0 0 8px;padding-left:20px">' +
      '<li>TIN, SSS, PhilHealth and Pag-IBIG numbers (with photos of the IDs)</li>' +
      '<li>Pre-Employment Medical and NBI clearance scans</li>' +
      '<li>Files in PDF, JPG or PNG, up to 5 MB each</li></ul>' +
      mailButton_('Open my form', link) +
      '<p>This personal link expires in ' + INVITE_DAYS + ' days.</p>'));
}

/** Issues a fresh link (old one stops working) and re-emails the applicant. */
function resendInvite(sessionToken, appId) {
  const s = requireRole_(sessionToken, [ROLES.HR]);
  return lock_(function () {
    const emp = findBy_(SHEETS.EMP, 'AppID', appId);
    if (!emp || EDITABLE_BY_APPLICANT.indexOf(emp.Status) < 0) throw new Error('This entry cannot be re-invited.');
    const inv = readAll_(SHEETS.INV).filter(function (r) { return r.AppID === appId; }).pop();
    if (!inv) throw new Error('Invite record not found.');
    const token = uuid_() + uuid_();
    updateObj_(SHEETS.INV, inv._row, { TokenHash: sha256_(token), ExpiresAt: addDaysIso_(INVITE_DAYS), Status: 'ACTIVE' });
    const link = pageUrl_('apply', { t: token });
    emailInvite_(inv.Email, inv.Name, link);
    audit_(s.email, s.role, 'INVITE_RESENT', appId, inv.Email);
    return { link: link };
  });
}

function revokeInvite(sessionToken, appId) {
  const s = requireRole_(sessionToken, [ROLES.HR]);
  return lock_(function () {
    const emp = findBy_(SHEETS.EMP, 'AppID', appId);
    if (!emp || emp.Status === STATUS.APPROVED) throw new Error('Cannot revoke this entry.');
    readAll_(SHEETS.INV).filter(function (r) { return r.AppID === appId; })
      .forEach(function (r) { updateObj_(SHEETS.INV, r._row, { Status: 'REVOKED' }); });
    updateObj_(SHEETS.EMP, emp._row, { Status: STATUS.CANCELLED, UpdatedAt: nowIso_() });
    audit_(s.email, s.role, 'INVITE_REVOKED', appId, '');
    return true;
  });
}
