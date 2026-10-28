// Sessions, PIN/password hashing, lockout and role checks (PRD 5.1, 12.3).
import { scryptSync, randomBytes, timingSafeEqual, createHash, randomInt } from 'node:crypto';
import { one, run, now } from './db.js';
import { fail, parseCookies, setCookie } from './http.js';

const SESSION_DAYS = 7;
const MAX_FAILED = 5;
const LOCK_MINUTES = 15;
export const COOKIE = 'kajar_sid';

// scrypt with N=2^15 (memory-hard). PRD asks for Argon2id or bcrypt; Node has neither
// built in, so scrypt is used and noted in docs/OPEN_ITEMS.md.
const SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export function hashSecret(secret) {
  const salt = randomBytes(16);
  const key = scryptSync(String(secret), salt, 32, SCRYPT);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

export function verifySecret(secret, stored) {
  if (!stored) return false;
  const [, saltB64, keyB64] = stored.split('$');
  const key = Buffer.from(keyB64, 'base64');
  const test = scryptSync(String(secret), Buffer.from(saltB64, 'base64'), key.length, SCRYPT);
  return timingSafeEqual(key, test);
}

export const sha256 = (s) => createHash('sha256').update(String(s)).digest('hex');

// Join codes: 8 chars from an alphabet without look-alikes (no 0/O, 1/I/L).
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function newJoinCode() {
  let s = '';
  for (let i = 0; i < 8; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return s;
}
export const normalizeCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export const hashJoinCode = (c) => sha256('join:' + normalizeCode(c));

export const nicknameKey = (n) => String(n || '').trim().toLowerCase().replace(/\s+/g, ' ');

export function newPseudonym() {
  return 'S-' + randomBytes(3).toString('hex').toUpperCase();
}

export function createSession(res, userId) {
  const token = randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString();
  run('INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)', sha256(token), userId, expires, now());
  setCookie(res, COOKIE, token, { maxAge: SESSION_DAYS * 86400 });
}

export function destroySession(req, res) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (token) run('DELETE FROM sessions WHERE id = ?', sha256(token));
  setCookie(res, COOKIE, '', { clear: true });
}

export function currentUser(req) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (!token) return null;
  const s = one('SELECT * FROM sessions WHERE id = ?', sha256(token));
  if (!s) return null;
  if (s.expires_at < now()) {
    run('DELETE FROM sessions WHERE id = ?', s.id);
    return null;
  }
  const u = one("SELECT * FROM users WHERE id = ? AND status = 'aktif'", s.user_id);
  return u || null;
}

// Middleware factory: ctx.user must exist and hold one of the roles.
export const requireRole = (...roles) => (ctx) => {
  if (!ctx.user) fail(401, 'BELUM_MASUK', 'Sesi berakhir. Silakan masuk lagi.');
  if (roles.length && !roles.includes(ctx.user.role)) {
    fail(403, 'TIDAK_BERWENANG', 'Halaman ini bukan untuk akunmu.');
  }
};

// Lockout bookkeeping shared by student PIN and staff password logins.
export function assertNotLocked(user) {
  if (user.locked_until && user.locked_until > now()) {
    const mins = Math.ceil((new Date(user.locked_until) - Date.now()) / 60000);
    fail(423, 'TERKUNCI', `Terlalu banyak percobaan. Coba lagi ${mins} menit lagi.`);
  }
}

export function recordFailedLogin(user) {
  const failed = (user.failed_logins || 0) + 1;
  if (failed >= MAX_FAILED) {
    const until = new Date(Date.now() + LOCK_MINUTES * 60000).toISOString();
    run('UPDATE users SET failed_logins = 0, locked_until = ? WHERE id = ?', until, user.id);
    return true;
  }
  run('UPDATE users SET failed_logins = ? WHERE id = ?', failed, user.id);
  return false;
}

export const clearFailedLogins = (user) =>
  run('UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ?', user.id);

export function createMagicLink(userId) {
  const token = randomBytes(24).toString('base64url');
  run('INSERT INTO magic_links (token_hash, user_id, expires_at) VALUES (?, ?, ?)',
    sha256(token), userId, new Date(Date.now() + 15 * 60000).toISOString());
  return token;
}
