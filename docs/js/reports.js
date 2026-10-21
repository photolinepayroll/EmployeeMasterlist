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
  $('#print').onclick = () => window.print();

  let D = null;
  secure('getLimitedMasterlist').then(d => {
    D = d;
    $('#head').innerHTML = '<tr><th>#</th>' + d.columns.map(c => '<th>' + esc(c.label) + '</th>').join('') + '</tr>';
    $('#gen').textContent = 'Generated ' + d.generatedAt;
    draw();
  }).catch(e => { $('#empty').textContent = e.message; });

  const mono = { BioID: 1, AccountNumber: 1 };
  function filtered() {
    const q = $('#q').value.toLowerCase(), t = $('#ftype').value;
    return D.rows.filter(r => (!t || r.AccountType === t) && (!q || (r.BioID + ' ' + r.FullName + ' ' + r.AccountNumber).toLowerCase().indexOf(q) >= 0));
  }
  function draw() {
    const list = filtered();
    $('#rows').innerHTML = list.map((r, i) => '<tr><td class="mute">' + (i + 1) + '</td>' +
      D.columns.map(c => '<td' + (mono[c.k] ? ' class="mono"' : '') + '>' + esc(r[c.k]) + '</td>').join('') + '</tr>').join('');
    $('#count').textContent = list.length + ' employee' + (list.length === 1 ? '' : 's');
    $('#empty').classList.toggle('hide', list.length > 0);
    $('#empty').textContent = 'No records.';
  }
  $('#q').oninput = draw; $('#ftype').onchange = draw;

  const heads = () => D.columns.map(c => c.label);
  const matrix = () => filtered().map(r => D.columns.map(c => r[c.k]));
  const textCols = () => D.columns.map((c, i) => (mono[c.k] ? i : -1)).filter(i => i >= 0);

  $('#csv').onclick = () => {
    if (!D) return;
    secure('logDownload', 'csv').catch(() => {});
    downloadBlob('Payroll_Masterlist_' + stamp() + '.csv', 'text/csv;charset=utf-8', toCsv(heads(), matrix(), textCols()));
  };
  $('#xlsx').onclick = () => {
    if (!D) return;
    downloadXlsx('Payroll_Masterlist_' + stamp() + '.xlsx', heads(), matrix())
      .then(() => secure('logDownload', 'xlsx').catch(() => {}))
      .catch(e => toast(e.message));
  };
})();
