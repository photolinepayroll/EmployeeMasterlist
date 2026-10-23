(function () {
  if (!requireLogin(['HR_ADMIN', 'PAYROLL', 'ACCOUNTING', 'AUDIT'])) return;
  $('#chrome').innerHTML = topbar('Payroll masterlist',
    '<span class="mute" style="font-size:.85rem">' + esc(Session.email) + ' · ' + esc(Session.role) + '</span>' +
    (Session.role === 'HR_ADMIN' ? '<a class="btn ghost sm" href="admin.html">HR Admin</a>' : '') +
    '<button class="btn ghost sm" id="logout" type="button">' + icon('logout') + ' Log out</button>');
  $('#logout').onclick = doLogout;
  $('#shield').innerHTML = icon('shield');
  $('#csv').innerHTML = icon('download') + ' CSV';
  $('#xlsx').innerHTML = icon('download') + ' Excel';
  $('#print').innerHTML = icon('printer') + ' Print';
  $('#print').onclick = () => { if (fresh) window.print(); };

  const LABEL = { ACTIVE: 'Active', ON_LEAVE: 'On Leave', RESIGNED: 'Resigned', AWOL: 'AWOL' };
  const FILE_TAG = { ACTIVE: 'ActiveOnly', '': 'AllEmployees', ON_LEAVE: 'OnLeave', RESIGNED: 'Resigned', AWOL: 'AWOL', NOT_ACTIVE: 'NotActive' };
  let D = null;
  let fresh = false;   // exports stay off until the server copy has loaded, so an old status list is never exported
  const CK = 'mlcache_report';
  const st = r => r.EmpStatus || 'ACTIVE';
  function setFresh(v) { fresh = v; ['csv', 'xlsx', 'print'].forEach(id => { $('#' + id).disabled = !v; }); }
  setFresh(false);

  function show(d, stale) {
    D = d;
    $('#head').innerHTML = '<tr><th>#</th>' + d.columns.map(c => '<th>' + esc(c.label) + '</th>').join('') + '</tr>';
    $('#gen').textContent = (stale ? 'Updating… showing data from ' : 'Generated ') + d.generatedAt + (stale ? '. Export is available once the latest data loads.' : '');
    draw();
  }
  // Show the last copy instantly (same tab session), then replace it with fresh data.
  try { const old = sessionStorage.getItem(CK); if (old) show(JSON.parse(old), true); } catch (e) { /* ignore */ }
  secure('getLimitedMasterlist').then(d => {
    setFresh(true);
    show(d, false);
    try { sessionStorage.setItem(CK, JSON.stringify(d)); } catch (e) { /* storage full or blocked */ }
  }).catch(e => { if (!D) $('#empty').textContent = e.message; else $('#gen').textContent = 'Could not refresh: ' + e.message + '. Exports are disabled; reload the page.'; });
  preloadXlsx();

  const mono = { BioID: 1, AccountNumber: 1 };
  const cell = (r, c) => c.k === 'EmpStatus' ? (LABEL[st(r)] || st(r)) : c.k === 'EmpStatusDate' ? (st(r) === 'ACTIVE' ? '' : (r.EmpStatusDate || '')) : r[c.k];

  function filtered() {
    const q = $('#q').value.toLowerCase(), t = $('#ftype').value, s = $('#fstat').value;
    return D.rows.filter(r => (!t || r.AccountType === t) &&
      (!s || (s === 'NOT_ACTIVE' ? st(r) !== 'ACTIVE' : st(r) === s)) &&
      (!q || (r.BioID + ' ' + r.FullName + ' ' + r.AccountNumber).toLowerCase().indexOf(q) >= 0));
  }
  function draw() {
    const list = filtered(), s = $('#fstat').value;
    $('#rows').innerHTML = list.map((r, i) => {
      const off = st(r) !== 'ACTIVE';
      return '<tr' + (off ? ' class="inactive"' : '') + '><td class="mute">' + (i + 1) + '</td>' +
        D.columns.map(c => {
          if (c.k === 'EmpStatus') return '<td><span class="pill ' + esc(st(r)) + '">' + esc(LABEL[st(r)] || st(r)) + '</span></td>';
          let v = esc(cell(r, c));
          if (r.Issue && (c.k === 'AccountNumber' || c.k === 'AccountType') && !r[c.k]) v = '<span class="pill AWOL">' + esc(r.Issue) + '</span>';
          return '<td' + (mono[c.k] ? ' class="mono"' : '') + '>' + v + '</td>';
        }).join('') + '</tr>';
    }).join('');
    const active = D.rows.filter(r => st(r) === 'ACTIVE').length, issues = D.rows.filter(r => r.Issue).length;
    $('#count').textContent = list.length + ' shown · ' + active + ' active of ' + D.rows.length;
    $('#empty').classList.toggle('hide', list.length > 0);
    $('#empty').textContent = 'No records.';
    const note = $('#statnote');
    let msg = '';
    if (s !== 'ACTIVE') msg += 'This view includes employees who are NOT active. Do not disburse to Resigned, AWOL or On Leave employees. ';
    if (issues) msg += issues + ' active employee' + (issues === 1 ? ' has' : 's have') + ' no account number or type; HR must complete before disbursing.';
    note.textContent = msg; note.classList.toggle('hide', !msg);
  }
  $('#q').oninput = draw; $('#ftype').onchange = draw; $('#fstat').onchange = draw;

  const heads = () => D.columns.map(c => c.label);
  const matrix = () => filtered().map(r => D.columns.map(c => cell(r, c)));
  const textCols = () => D.columns.map((c, i) => (mono[c.k] ? i : -1)).filter(i => i >= 0);
  const fname = ext => 'Payroll_Masterlist_' + FILE_TAG[$('#fstat').value] + '_' + stamp() + '.' + ext;

  $('#csv').onclick = () => {
    if (!D || !fresh) return;
    secure('logDownload', 'csv').catch(() => {});
    downloadBlob(fname('csv'), 'text/csv;charset=utf-8', toCsv(heads(), matrix(), textCols()));
  };
  $('#xlsx').onclick = () => {
    if (!D || !fresh) return;
    downloadXlsx(fname('xlsx'), heads(), matrix())
      .then(() => secure('logDownload', 'xlsx').catch(() => {}))
      .catch(e => toast(e.message));
  };
})();
