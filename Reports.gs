/**
 * Reports.gs — the limited masterlist for Payroll / Accounting / Audit (and HR).
 * Returns ONLY: Bio ID, Full Name, Account No., Account Type — for APPROVED employees.
 */

function getLimitedMasterlist(token) {
  const s = requireRole_(token, REPORT_ROLES);
  // The snapshot holds only the 4 limited columns; any change to them clears it (see updateObj_).
  let out = cacheGetBig_('rpt_limited');
  if (!out) {
    const rows = readAll_(SHEETS.EMP)
      .filter(function (r) { return r.Status === STATUS.APPROVED; })
      .map(function (r) {
        const st = EMP_STATUSES.indexOf(r.EmpStatus) >= 0 ? r.EmpStatus : 'ACTIVE';
        // Issue = something that could send money to a wrong or empty account; shown only for people still being paid.
        const issue = st !== 'ACTIVE' ? '' : !r.AccountNumber ? 'No account number' : !r.AccountType ? 'No account type' : '';
        return {
          BioID: r.BioID, FullName: fullName_(r), AccountNumber: r.AccountNumber, AccountType: r.AccountType,
          EmpStatus: st, EmpStatusDate: r.EmpStatusDate || '', Issue: issue
        };
      })
      .sort(function (a, b) {
        return ((a.EmpStatus === 'ACTIVE' ? 0 : 1) - (b.EmpStatus === 'ACTIVE' ? 0 : 1)) || a.FullName.localeCompare(b.FullName);
      });
    out = { columns: LIMITED_REPORT_COLS, rows: rows, generatedAt: nowIso_(), company: companyName_() };
    cachePutBig_('rpt_limited', out);
  }
  audit_(s.email, s.role, 'VIEW_REPORT', '', out.rows.length + ' rows');
  return out;
}

function logDownload(token, format) {
  const s = requireRole_(token, REPORT_ROLES);
  audit_(s.email, s.role, 'DOWNLOAD_REPORT', '', String(format).slice(0, 10));
  return true;
}
