(function () {
  if (!requireLogin(['HR_ADMIN'])) return;
  let B = null, apps = [], cur = null;

  $('#chrome').innerHTML = topbar('HR Admin',
    '<span class="mute" style="font-size:.85rem">' + esc(Session.email) + '</span>' +
    '<a class="btn ghost sm" href="reports.html">' + icon('file') + ' Payroll report</a>' +
    '<button class="btn ghost sm" id="logout" type="button">' + icon('logout') + ' Log out</button>');
  $('#logout').onclick = doLogout;
  $('#refresh').innerHTML = icon('refresh') + ' Refresh';
  $('#isend').innerHTML = icon('send') + ' Send invite';
  $('#xcsv').innerHTML = icon('download') + ' Download CSV';
  $('#xxlsx').innerHTML = icon('download') + ' Download Excel';

  secure('adminBootstrap').then(b => {
    B = b;
    $('#ibranch').innerHTML = '<option value="">—</option>' + b.lists.Branches.map(x => '<option>' + esc(x) + '</option>').join('');
    $('#urole').innerHTML = b.roles.map(r => '<option>' + r + '</option>').join('');
    loadApps();
  }).catch(e => toast(e.message));

  $$('#tabs button').forEach(b => {
    b.onclick = () => {
      $$('#tabs button').forEach(x => x.classList.toggle('on', x === b));
      ['apps', 'invite', 'export', 'users'].forEach(t => $('#t_' + t).classList.toggle('hide', t !== b.dataset.t));
      if (b.dataset.t === 'users') loadUsers();
    };
  });

  /* ---------- applications ---------- */
  function loadApps() {
    $('#empty').textContent = 'Loading…'; $('#empty').classList.remove('hide');
    return secure('listApplications').then(r => { apps = r; drawApps(); }).catch(e => { $('#empty').textContent = e.message; });
  }
  function drawApps() {
    const counts = { PENDING: 0, RETURNED: 0, INVITED: 0, APPROVED: 0 };
    apps.forEach(a => { if (counts[a.Status] != null) counts[a.Status]++; });
    $('#stats').innerHTML = Object.keys(counts).map(k => '<div class="stat"><b>' + counts[k] + '</b><span>' + k + '</span></div>').join('');
    const q = $('#q').value.toLowerCase(), fs = $('#fstatus').value;
    const list = apps.filter(a => (!fs || a.Status === fs) && (!q || [a.Name, a.BioID, a.Email, a.Branch, a.AppID].join(' ').toLowerCase().indexOf(q) >= 0));
    $('#rows').innerHTML = list.map(a =>
      '<tr class="click" tabindex="0" data-id="' + esc(a.AppID) + '"><td><span class="pill ' + esc(a.Status) + '">' + esc(a.Status) + '</span></td><td>' +
      esc(a.Name || '(not filled yet)') + '</td><td class="mono">' + esc(a.BioID) + '</td><td>' + esc(a.Branch) + '</td><td>' + esc(a.Email) + '</td><td>' + esc(a.SubmittedAt) + '</td></tr>').join('');
    $('#empty').classList.toggle('hide', list.length > 0);
    $('#empty').textContent = 'No records match.';
    $$('#rows tr').forEach(tr => {
      tr.onclick = () => openRecord(tr.dataset.id);
      tr.onkeydown = e => { if (e.key === 'Enter') openRecord(tr.dataset.id); };
    });
  }
  $('#q').oninput = drawApps; $('#fstatus').onchange = drawApps; $('#refresh').onclick = loadApps;

  /* ---------- review drawer ---------- */
  function openDrawer() { $('#drawer').classList.add('open'); $('#drawer').setAttribute('aria-hidden', 'false'); }
  function closeDrawer() { $('#drawer').classList.remove('open'); $('#drawer').setAttribute('aria-hidden', 'true'); }
  $('#drawer').onclick = e => { if (e.target === $('#drawer')) closeDrawer(); };
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });

  function openRecord(id) {
    $('#panel').innerHTML = '<p class="center"><span class="spin"></span> Loading…</p>';
    openDrawer();
    secure('getApplication', id).then(r => { cur = r; drawRecord(); }).catch(e => { toast(e.message); closeDrawer(); });
  }

  function drawRecord() {
    const r = cur, canEdit = r.Status === 'PENDING' || r.Status === 'APPROVED';
    let h = '<div class="row" style="margin-bottom:12px"><h2 class="grow">' + esc(r.AppID) + ' <span class="pill ' + esc(r.Status) + '">' + esc(r.Status) + '</span></h2>' +
      '<button class="btn ghost sm" id="close" type="button">' + icon('x') + ' Close</button></div>';
    if (r.Remarks) h += '<div class="notice">' + icon('info') + '<div>Remarks sent to applicant: ' + esc(r.Remarks) + '</div></div>';
    const canResend = r.Status === 'INVITED' || r.Status === 'RETURNED';
    if (!canEdit) {
      h += '<div class="notice info">' + icon('info') + '<div>This entry is ' + esc(r.Status) + ' — waiting on the applicant, so it cannot be approved yet.' +
        (canResend ? '<div class="row" style="margin-top:10px"><button class="btn sm" id="resend" type="button">' + icon('send') + ' Resend invite</button></div><div id="resendout"></div>' : '') + '</div></div>';
    }
    h += '<div class="card" id="aform"><h3>Applicant information</h3><div class="grid">';
    B.applicantSpec.forEach(f => { if (f.type !== 'file' && f.type !== 'files') h += fieldHtml(f, r.record[f.k], B.lists, 'a'); });
    h += '</div></div><div class="card"><h3>Documents</h3>' + filesHtml(r.files) + '</div>';
    h += '<div class="card" id="mform"><h3>HR admin entry</h3><div class="grid">';
    B.adminSpec.forEach(f => { h += fieldHtml(f, r.record[f.k], B.lists, 'm'); });
    h += '</div></div>';
    if (canEdit) {
      h += '<div class="row end"><button class="btn ghost" id="save" type="button">Save changes</button>' +
        (r.Status === 'PENDING' ? '<button class="btn danger" id="ret" type="button">Return to applicant…</button>' : '') +
        '<button class="btn ok" id="appr" type="button">' + icon('check') + (r.Status === 'APPROVED' ? ' Save approved record' : ' Approve to masterlist') + '</button></div>';
    }
    $('#panel').innerHTML = h;
    $('#close').onclick = closeDrawer;
    wireBlurValidation($('#aform'), B.applicantSpec);
    wireBlurValidation($('#mform'), B.adminSpec);
    if (!canEdit) $$('#panel input,#panel select,#panel textarea').forEach(el => { el.disabled = true; });
    $$('[data-file]').forEach(a => { a.onclick = () => openFile(a.dataset.file); });
    if ($('#resend')) {
      $('#resend').onclick = function () {
        const b = this; busy(b, true, 'Sending…');
        secure('resendInvite', cur.AppID).then(res => {
          $('#resendout').innerHTML = '<p style="margin:8px 0 4px">New invite emailed. The old link no longer works. Backup link:</p><input readonly value="' + esc(res.link) + '" onclick="this.select()" aria-label="Invite link">';
          toast('Invite resent');
        }).catch(e => toast(e.message)).then(() => busy(b, false));
      };
    }
    if (canEdit) {
      $('#save').onclick = function () { submitRecord('saveRecord', this, 'Saved'); };
      $('#appr').onclick = function () { submitRecord('approveApplication', this, 'Approved'); };
      if ($('#ret')) $('#ret').onclick = doReturn;
    }
  }

  function filesHtml(f) {
    const groups = [], byName = {};
    B.applicantSpec.filter(s => s.type === 'file' || s.type === 'files').forEach(s => {
      const v = f[s.k], list = Array.isArray(v) ? v : (v ? [v] : []);
      const g = s.group || 'Documents';
      if (!byName[g]) { byName[g] = []; groups.push(g); }
      list.forEach(d => byName[g].push([s.label + ': ' + d.name, d.id]));
    });
    const chip = i => '<span class="chip" tabindex="0" role="button" data-file="' + esc(i[1]) + '">' + icon('file') + ' ' + esc(i[0]) + '</span>';
    const h = groups.filter(g => byName[g].length).map(g => '<p class="mute" style="margin:10px 0 4px;font-size:.85rem">' + esc(g) + '</p>' + byName[g].map(chip).join('')).join('');
    return h || '<span class="mute">No documents uploaded.</span>';
  }

  function openFile(id) {
    toast('Opening file…');
    secure('getFile', cur.AppID, id).then(f => {
      const blob = b64ToBlob(f.base64, f.mime), url = URL.createObjectURL(blob);
      const w = window.open(url, '_blank', 'noopener');
      if (!w) downloadBlob(f.name, f.mime, blob);
    }).catch(e => toast(e.message));
  }

  const gather = () => Object.assign(readFields($('#aform'), B.applicantSpec), readFields($('#mform'), B.adminSpec));

  function submitRecord(fn, btn, okMsg) {
    showErrors($('#panel'), {});
    busy(btn, true, 'Saving…');
    secure(fn, cur.AppID, gather()).then(() => { toast(okMsg); closeDrawer(); loadApps(); }).catch(e => {
      busy(btn, false);
      if (e.fields) { showErrors($('#panel'), e.fields); toast('Please fix the highlighted fields.'); } else toast(e.message);
    });
  }

  function doReturn() {
    if ($('#retbox')) return;
    const box = document.createElement('div');
    box.id = 'retbox'; box.className = 'card';
    box.innerHTML = '<label for="retmsg" style="margin-top:0">Tell the applicant what to correct (they will see this and be emailed)</label>' +
      '<textarea id="retmsg" maxlength="500"></textarea><div class="err" id="reterr" role="alert"></div>' +
      '<div class="row end" style="margin-top:10px"><button class="btn ghost sm" id="retcancel" type="button">Cancel</button><button class="btn danger sm" id="retgo" type="button">Send back</button></div>';
    $('#panel').appendChild(box);
    box.scrollIntoView({ behavior: 'smooth' });
    $('#retmsg').focus();
    $('#retcancel').onclick = () => box.remove();
    $('#retgo').onclick = function () {
      const remarks = $('#retmsg').value.trim();
      if (!remarks) { $('#reterr').textContent = 'Enter remarks first.'; return; }
      const b = this; busy(b, true, 'Sending…');
      secure('returnApplication', cur.AppID, remarks).then(() => { toast('Returned to applicant'); closeDrawer(); loadApps(); })
        .catch(e => { busy(b, false); $('#reterr').textContent = e.message; });
    };
  }

  /* ---------- invite ---------- */
  $('#isend').onclick = function () {
    const b = this; $('#ierr').textContent = ''; $('#ilink').classList.add('hide');
    busy(b, true, 'Sending…');
    secure('createInvite', { name: $('#iname').value, email: $('#iemail').value, branch: $('#ibranch').value }).then(r => {
      $('#ilink').classList.remove('hide');
      $('#ilink').innerHTML = icon('check') + '<div>Invite emailed. Reference <b>' + esc(r.appId) + '</b>.<br>Backup link:<input readonly value="' + esc(r.link) + '" onclick="this.select()" aria-label="Invite link"></div>';
      $('#iname').value = ''; $('#iemail').value = '';
      loadApps();
    }).catch(e => { $('#ierr').textContent = e.message; }).then(() => busy(b, false));
  };

  /* ---------- export ---------- */
  function fetchExport() {
    return secure('exportFullMasterlist').then(d => { if (!d.rows.length) { toast('No approved employees yet.'); return null; } return d; });
  }
  $('#xcsv').onclick = () => fetchExport().then(d => { if (d) downloadBlob('Employee_Masterlist_FULL_' + stamp() + '.csv', 'text/csv;charset=utf-8', toCsv(d.headers, d.rows, d.headers.map((_, i) => i))); }).catch(e => toast(e.message));
  $('#xxlsx').onclick = () => fetchExport().then(d => d && downloadXlsx('Employee_Masterlist_FULL_' + stamp() + '.xlsx', d.headers, d.rows)).catch(e => toast(e.message));

  /* ---------- users ---------- */
  function loadUsers() {
    secure('listUsers').then(us => {
      $('#urows').innerHTML = us.map(u => '<tr><td>' + esc(u.Email) + '</td><td>' + esc(u.Role) + '</td><td>' + (u.Active ? 'Active' : 'Disabled') +
        '</td><td><button class="btn ghost sm" type="button" data-e="' + esc(u.Email) + '" data-r="' + esc(u.Role) + '" data-a="' + (u.Active ? 1 : 0) + '">Edit</button></td></tr>').join('');
      $$('#urows button').forEach(b => { b.onclick = () => { $('#uemail').value = b.dataset.e; $('#urole').value = b.dataset.r; $('#uactive').value = b.dataset.a; }; });
    }).catch(e => toast(e.message));
  }
  $('#usave').onclick = () => {
    $('#uerr').textContent = '';
    secure('upsertUser', $('#uemail').value, $('#urole').value, $('#uactive').value === '1')
      .then(() => { toast('User saved'); $('#uemail').value = ''; loadUsers(); })
      .catch(e => { $('#uerr').textContent = e.message; });
  };
})();
