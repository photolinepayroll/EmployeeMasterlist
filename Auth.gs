/**
 * Auth.gs — staff login (email allowlist + one-time code) and role checks.
 * Applicants never log in; they use invite tokens (see Applicant.gs).
 */

function requestLoginCode(email) {
  email = normEmail_(email);
  const generic = { ok: true, message: 'If this email is registered, a login code has been sent.' };
  if (!new RegExp(PATTERNS.email).test(email)) return generic;

  const cache = CacheService.getScriptCache();
  const throttleKey = 'otpthr_' + sha256_(email);
  if (cache.get(throttleKey)) return generic;          // max one code per 30 seconds
  cache.put(throttleKey, '1', 30);

  const user = activeUser_(email);
  if (!user) {
    audit_(email, '', 'LOGIN_UNKNOWN', '', 'Email not on allowlist');
    return generic;
  }
  const code = String(100000 + (parseInt(uuid_().slice(0, 12), 16) % 900000));
  cache.put('otp_' + sha256_(email), sha256_(code + email), OTP_TTL_SEC);
  cache.remove('otpatt_' + sha256_(email));
  sendMail_(email, 'Your login code: ' + code,
    mailShell_('Login code',
      '<p>Your one-time login code is:</p><p style="font-size:28px;letter-spacing:6px;font-weight:bold">' + code + '</p>' +
      '<p>It expires in 10 minutes. If you did not request it, ignore this email.</p>'));
  audit_(email, user.Role, 'LOGIN_CODE_SENT', '', '');
  return generic;
}

function verifyLoginCode(email, code) {
  email = normEmail_(email);
  code = String(code || '').trim();
  const cache = CacheService.getScriptCache();
  const h = sha256_(email);
  const attKey = 'otpatt_' + h;
  const attempts = Number(cache.get(attKey) || 0);
  if (attempts >= OTP_MAX_ATTEMPTS) throw new Error('Too many attempts. Request a new code.');
  const stored = cache.get('otp_' + h);
  const user = activeUser_(email);
  if (!stored || !user || stored !== sha256_(code + email)) {
    cache.put(attKey, String(attempts + 1), OTP_TTL_SEC);
    audit_(email, '', 'LOGIN_FAILED', '', '');
    throw new Error('Invalid or expired code.');
  }
  cache.remove('otp_' + h);
  cache.remove(attKey);
  const token = uuid_() + uuid_();
  cache.put('sess_' + sha256_(token), JSON.stringify({ email: email, role: user.Role }), SESSION_TTL_SEC);
  audit_(email, user.Role, 'LOGIN_OK', '', '');
  return { token: token, email: email, role: user.Role, home: user.Role === ROLES.HR ? 'admin' : 'reports' };
}

function logout(token) {
  const s = session_(token);
  CacheService.getScriptCache().remove('sess_' + sha256_(String(token || '')));
  if (s) audit_(s.email, s.role, 'LOGOUT', '', '');
  return true;
}

/** Active staff user or null. Positive hits are cached for 2 min; upsertUser clears the entry. */
function activeUser_(email) {
  const cache = CacheService.getScriptCache();
  const key = 'usr_' + sha256_(email);
  const hit = cache.get(key);
  if (hit) { try { return JSON.parse(hit); } catch (e) { /* fall through */ } }
  const u = findBy_(SHEETS.USERS, 'Email', email);
  if (!u || !isTrue_(u.Active) || ALL_ROLES.indexOf(u.Role) < 0) return null;
  const slim = { Email: u.Email, Role: u.Role };
  cache.put(key, JSON.stringify(slim), 120);
  return slim;
}

function session_(token) {
  if (!token) return null;
  const raw = CacheService.getScriptCache().get('sess_' + sha256_(String(token)));
  if (!raw) return null;
  const s = JSON.parse(raw);
  // Re-check the allowlist on every call so removed users lose access immediately.
  const u = activeUser_(s.email);
  return u ? { email: s.email, role: u.Role } : null;
}

/** Every protected server function starts with this. Throws if not allowed. */
function requireRole_(token, roles) {
  const s = session_(token);
  if (!s) throw new Error('SESSION: Please log in again.');
  if (roles.indexOf(s.role) < 0) {
    audit_(s.email, s.role, 'DENIED', '', 'Needed ' + roles.join('/'));
    throw new Error('Not authorized.');
  }
  return s;
}

/** Lets a page confirm its session and learn the role. */
function whoAmI(token) {
  const s = session_(token);
  if (!s) throw new Error('SESSION: Please log in again.');
  return s;
}
