(function () {
  $('#chrome').innerHTML = topbar('Staff access');
  let email = '';
  const home = role => (role === 'HR_ADMIN' ? 'admin.html' : 'reports.html');

  // Already signed in? Go straight to the right page.
  if (Session.token && Session.role) { location.replace(home(Session.role)); return; }

  $('#f1').addEventListener('submit', e => {
    e.preventDefault();
    email = $('#email').value.trim();
    $('#e1').textContent = '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { $('#e1').textContent = 'Enter a valid email address.'; return; }
    const b = $('#send'); busy(b, true, 'Sending…');
    call('requestLoginCode', email)
      .then(() => { $('#f1').classList.add('hide'); $('#f2').classList.remove('hide'); $('#code').focus(); })
      .catch(err => { $('#e1').textContent = err.message; })
      .then(() => busy(b, false));
  });

  $('#f2').addEventListener('submit', e => {
    e.preventDefault();
    const b = $('#verify'); $('#e2').textContent = ''; busy(b, true, 'Checking…');
    call('verifyLoginCode', email, $('#code').value.trim())
      .then(r => { Session.set(r.token, r.role, r.email); location.href = home(r.role); })
      .catch(err => { $('#e2').textContent = err.message; busy(b, false); });
  });

  $('#back').addEventListener('click', () => {
    $('#f2').classList.add('hide'); $('#f1').classList.remove('hide'); $('#code').value = ''; $('#email').focus();
  });
})();
