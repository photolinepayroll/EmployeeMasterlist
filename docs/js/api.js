/* JSON API client for the Apps Script backend.
   A string body is sent as text/plain, which is a CORS "simple request" (no preflight) — required for Apps Script. */
const Session = {
  get token() { try { return sessionStorage.getItem('mlt') || ''; } catch (e) { return ''; } },
  get role() { try { return sessionStorage.getItem('mlr') || ''; } catch (e) { return ''; } },
  get email() { try { return sessionStorage.getItem('mle') || ''; } catch (e) { return ''; } },
  set(t, r, e) { try { sessionStorage.setItem('mlt', t); sessionStorage.setItem('mlr', r); sessionStorage.setItem('mle', e); } catch (x) { /* storage blocked */ } },
  clear() { try { sessionStorage.clear(); } catch (e) { /* ignore */ } }
};

/** One request with a timeout. Apps Script can take several seconds on a cold start. */
async function post_(body, ms) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(window.API_URL, { method: 'POST', redirect: 'follow', body, signal: ctl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function call(fn, ...args) {
  const body = JSON.stringify({ fn, args });
  // Uploads get a longer timeout; reads are retried once because the first Apps Script call is often slow or dropped.
  const ms = fn === 'uploadFile' ? 120000 : 45000;
  const retry = fn !== 'uploadFile' && fn !== 'submitApplication' && fn !== 'createInvite' && fn !== 'resendInvite';
  let res;
  try {
    try { res = await post_(body, ms); }
    catch (e) { if (!retry) throw e; res = await post_(body, ms); }
  } catch (e) {
    throw new Error(e && e.name === 'AbortError'
      ? 'The server is taking too long to respond. Please try again.'
      : 'Cannot reach the server. Check your connection and try again.');
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
