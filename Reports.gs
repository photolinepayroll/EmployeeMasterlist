/**
 * Reports.gs — the limited masterlist for Payroll / Accounting / Audit (and HR).
 * Returns ONLY: Bio ID, Full Name, Account No., Account Type — for APPROVED employees.
 */

function getLimitedMasterlist(token) {
  const s = requireRole_(token, REPORT_ROLES);
  const rows = readAll_(SHEETS.EMP)
    .filter(function (r) { return r.Status === STATUS.APPROVED; })
    .map(function (r) {
      return { BioID: r.BioID, FullName: fullName_(r), AccountNumber: r.AccountNumber, AccountType: r.AccountType };
    })
    .sort(function (a, b) { return a.FullName.localeCompare(b.FullName); });
  audit_(s.email, s.role, 'VIEW_REPORT', '', rows.length + ' rows');
  return { columns: LIMITED_REPORT_COLS, rows: rows, generatedAt: nowIso_(), company: companyName_() };
}

function logDownload(token, format) {
  const s = requireRole_(token, REPORT_ROLES);
  audit_(s.email, s.role, 'DOWNLOAD_REPORT', '', String(format).slice(0, 10));
  return true;
}
