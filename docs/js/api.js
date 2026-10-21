/* JSON API client for the Apps Script backend.
   A string body is sent as text/plain, which is a CORS "simple request" (no preflight) — required for Apps Script. */
const Session = {
  get token() { try { return sessionStorage.getItem('mlt') || ''; } catch (e) { return ''; } },
  get role() { try { return sessionStorage.getItem('mlr') || ''; } catch (e) { return ''; } },
  get email() { try { return sessionStorage.getItem('mle') || ''; } catch (e) { return ''; } },
  set(t, r, e) { try { sessionStorage.setItem('mlt', t); sessionStorage.setItem('mlr', r); sessionStorage.setItem('mle', e); } catch (x) { /* storage blocked */ } },
  clear() { try { sessionStorage.clear(); } catch (e) { /* ignore */ } }
};

async function call(fn, ...args) {
  let res;
  try {
    res = await fetch(window.API_URL, { method: 'POST', redirect: 'follow', body: JSON.stringify({ fn, args }) });
  } catch (e) {
    throw new Error('Cannot reach the server. Check your connection and try again.');
  }
  let j;
  try { j = await res.json(); } catch (e) { throw new Error('Unexpected server response. Please try again.'); }
  if (j.ok) return j.data;
  const err = new Error(j.error || 'Something went wrong.');
  if (j.fields) err.fields = j.fields;
  if (j.session) err.session = true;
  throw err;
}

/** Calls a protected function with the session token; sends the user to login when the session ended. */
async function secure(fn, ...args) {
  try {
    return await call(fn, Session.token, ...args);
  } catch (e) {
    if (e.session) { Session.clear(); location.href = 'index.html'; }
    throw e;
  }
}
