// PRD 5.1 accounts and onboarding.
import { one, run, insert, audit } from '../db.js';
import { fail, check, rateLimit, clientIp } from '../http.js';
import {
  hashSecret, verifySecret, createSession, destroySession, hashJoinCode, nicknameKey, newPseudonym,
  assertNotLocked, recordFailedLogin, clearFailedLogins, createMagicLink, sha256,
} from '../auth.js';
import { getSetting } from '../settings.js';
import { remainingToday } from '../ai/pipeline.js';

const LOGIN_FAIL = 'Nama panggilan atau PIN belum cocok. Coba lagi atau minta guru mengatur ulang PIN.';

function classByCode(code) {
  const c = one('SELECT c.*, s.name AS school_name FROM classes c JOIN schools s ON s.id = c.school_id WHERE c.join_code_hash = ?', hashJoinCode(code));
  if (!c || !c.join_code_active) fail(404, 'KODE_TIDAK_DIKENAL', 'Kode kelas tidak dikenal atau sudah tidak aktif. Cek lagi ke gurumu.', { field: 'code' });
  return c;
}

export function consentState(classId) {
  if (!classId) return { sekolah: false, wali: false, complete: false };
  const sekolah = Boolean(one("SELECT id FROM consents WHERE class_id = ? AND type = 'sekolah'", classId));
  const wali = Boolean(one("SELECT id FROM consents WHERE class_id = ? AND type = 'wali'", classId));
  return { sekolah, wali, complete: sekolah && wali };
}

export function meView(u) {
  const base = { id: u.id, role: u.role, name: u.display_name, prefs: JSON.parse(u.prefs || '{}') };
  if (u.role !== 'student') {
    const training = u.role === 'reviewer' ? one('SELECT score, passed_at FROM reviewer_training WHERE user_id = ? AND passed_at IS NOT NULL ORDER BY created_at DESC LIMIT 1', u.id) : null;
    return { ...base, email: u.email, trained: Boolean(training) };
  }
  const cls = one('SELECT name FROM classes WHERE id = ?', u.class_id);
  return {
    ...base,
    class_name: cls?.name,
    onboarded: Boolean(u.onboarded),
    consent: consentState(u.class_id),
    pretest_done: Boolean(one("SELECT id FROM assessments WHERE user_id = ? AND kind = 'awal' AND finished_at IS NOT NULL", u.id)),
    posttest_done: Boolean(one("SELECT id FROM assessments WHERE user_id = ? AND kind = 'akhir' AND finished_at IS NOT NULL", u.id)),
    posttest_open: Boolean(getSetting('posttest_open')),
    remaining: remainingToday(u.id),
    help: { text: getSetting('help_text'), contacts: getSetting('help_contacts') },
    notes_new: one("SELECT COUNT(*) n FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.user_id = ? AND m.role IN ('reviewer','system') AND m.seen = 0", u.id).n,
  };
}

export default function register(r) {
  r.post('/api/auth/student/check-code', ({ body, req }) => {
    rateLimit(`code:${clientIp(req)}`, 10, 60_000);
    const { code } = check(body, { code: { type: 'string', label: 'Kode kelas', max: 20 } });
    const c = classByCode(code);
    return { class_name: c.name, school_name: c.school_name };
  });

  r.post('/api/auth/student/register', ({ body, req, res }) => {
    rateLimit(`login:${clientIp(req)}`, 10, 60_000);
    const v = check(body, {
      code: { type: 'string', label: 'Kode kelas', max: 20 },
      nickname: {
        type: 'string', label: 'Nama panggilan', min: 2, max: 20, pattern: /^[\p{L}][\p{L}\d ]*$/u,
        msg: 'Nama panggilan 2–20 huruf, boleh ditambah angka. Jangan pakai nama lengkap.',
      },
      pin: { type: 'string', label: 'PIN', pattern: /^\d{6}$/, msg: 'PIN harus 6 angka.' },
      pin2: { type: 'string', label: 'Ulangi PIN', pattern: /^\d{6}$/, msg: 'Ulangi PIN dengan 6 angka yang sama.' },
    });
    if (v.pin !== v.pin2) fail(400, 'PIN_BEDA', 'PIN dan ulangan PIN belum sama. Ketik ulang keduanya.', { field: 'pin2' });
    if (/^(\d)\1{5}$/.test(v.pin) || v.pin === '123456' || v.pin === '654321') {
      fail(400, 'PIN_LEMAH', 'PIN ini terlalu mudah ditebak. Pilih 6 angka lain.', { field: 'pin' });
    }
    const c = classByCode(v.code);
    const key = nicknameKey(v.nickname);
    if (one('SELECT id FROM users WHERE nickname_key = ?', key)) {
      fail(409, 'NAMA_DIPAKAI', `Nama panggilan "${v.nickname}" sudah dipakai. Tambahkan angka, misalnya ${v.nickname}${(v.pin.charCodeAt(5) % 9) + 1}.`, { field: 'nickname' });
    }
    const u = insert('users', {
      role: 'student', display_name: v.nickname, nickname_key: key, pin_hash: hashSecret(v.pin), class_id: c.id,
      school_id: c.school_id, pseudonym: newPseudonym(), status: 'aktif', onboarded: 0, prefs: '{}',
    });
    audit(u.id, 'daftar_siswa', 'users', u.id, { class_id: c.id });
    createSession(res, u.id);
    return { me: meView(u) };
  });

  r.post('/api/auth/student/login', ({ body, req, res }) => {
    rateLimit(`login:${clientIp(req)}`, 10, 60_000);
    const v = check(body, {
      nickname: { type: 'string', label: 'Nama panggilan', max: 20 },
      pin: { type: 'string', label: 'PIN', max: 6 },
    });
    const u = one("SELECT * FROM users WHERE nickname_key = ? AND role = 'student' AND status = 'aktif'", nicknameKey(v.nickname));
    if (!u) fail(401, 'GAGAL_MASUK', LOGIN_FAIL);
    assertNotLocked(u);
    if (!verifySecret(v.pin, u.pin_hash)) {
      const locked = recordFailedLogin(u);
      if (locked) fail(423, 'TERKUNCI', 'Terlalu banyak percobaan. Coba lagi 15 menit lagi.');
      fail(401, 'GAGAL_MASUK', LOGIN_FAIL);
    }
    clearFailedLogins(u);
    createSession(res, u.id);
    return { me: meView(u) };
  });

  r.post('/api/auth/staff/login', ({ body, req, res }) => {
    rateLimit(`login:${clientIp(req)}`, 10, 60_000);
    const v = check(body, {
      email: { type: 'string', label: 'Email', max: 120 },
      password: { type: 'string', label: 'Kata sandi', max: 200 },
    });
    const u = one("SELECT * FROM users WHERE email = ? AND role != 'student' AND status = 'aktif'", v.email.toLowerCase());
    const msg = 'Email atau kata sandi belum cocok. Periksa lagi, atau minta tautan masuk.';
    if (!u) fail(401, 'GAGAL_MASUK', msg);
    assertNotLocked(u);
    if (!verifySecret(v.password, u.password_hash)) {
      if (recordFailedLogin(u)) fail(423, 'TERKUNCI', 'Terlalu banyak percobaan. Coba lagi 15 menit lagi.');
      fail(401, 'GAGAL_MASUK', msg);
    }
    clearFailedLogins(u);
    createSession(res, u.id);
    audit(u.id, 'masuk_staf', 'users', u.id);
    return { me: meView(u) };
  });

  // Magic link. There is no mail service in the pilot build: the link is written to the server log.
  r.post('/api/auth/staff/magic-link', ({ body, req }) => {
    rateLimit(`magic:${clientIp(req)}`, 5, 60_000);
    const { email } = check(body, { email: { type: 'string', label: 'Email', max: 120, pattern: /^[^@\s]+@[^@\s]+\.[^@\s]+$/, msg: 'Email belum lengkap. Contoh: nama@kampus.ac.id' } });
    const u = one("SELECT id FROM users WHERE email = ? AND role != 'student' AND status = 'aktif'", email.toLowerCase());
    if (u) {
      const token = createMagicLink(u.id);
      console.log(JSON.stringify({ level: 'info', event: 'magic_link', url: `/api/auth/magic/${token}` }));
    }
    return { ok: true, message: 'Kalau email terdaftar, tautan masuk sudah dikirim. Tautan berlaku 15 menit.' };
  });

  r.get('/api/auth/magic/:token', ({ params, res }) => {
    const row = one('SELECT * FROM magic_links WHERE token_hash = ?', sha256(params.token));
    if (!row || row.used_at || row.expires_at < new Date().toISOString()) {
      res.writeHead(302, { Location: '/staf/masuk?tautan=kedaluwarsa' });
      res.end();
      return undefined;
    }
    run('UPDATE magic_links SET used_at = ? WHERE token_hash = ?', new Date().toISOString(), row.token_hash);
    createSession(res, row.user_id);
    res.writeHead(302, { Location: '/' });
    res.end();
    return undefined;
  });

  // Demo mode (DEMO_MODE=1): one-click sign-in for judges and visitors. Off by default; never enable in a pilot.
  r.get('/api/config', () => ({ demo: process.env.DEMO_MODE === '1' }));

  r.post('/api/auth/demo', ({ body, req, res }) => {
    if (process.env.DEMO_MODE !== '1') fail(404, 'TIDAK_DITEMUKAN', 'Alamat tidak ditemukan.');
    rateLimit(`demo:${clientIp(req)}`, 20, 60_000);
    const { account } = check(body, {
      account: { type: 'string', label: 'Akun demo', oneOf: ['siswa_baru', 'siswa', 'siswa_tunggu', 'peninjau', 'guru', 'koordinator', 'admin'] },
    });
    let u;
    if (account === 'siswa_baru') {
      // A fresh student per visitor, so judges see onboarding and the pre-test and do not share a daily limit.
      const cls = one("SELECT id, school_id FROM classes WHERE name = 'X-1' ORDER BY created_at LIMIT 1");
      if (!cls) fail(500, 'DEMO_RUSAK', 'Data demo belum siap. Muat ulang halaman.');
      const nick = `Juri${Math.floor(1000 + Math.random() * 9000)}`;
      u = insert('users', {
        role: 'student', display_name: nick, nickname_key: nicknameKey(nick), pin_hash: null, class_id: cls.id,
        school_id: cls.school_id, pseudonym: newPseudonym(), status: 'aktif', onboarded: 0, prefs: '{}',
      });
    } else {
      const who = {
        siswa: "nickname_key = 'rani'", siswa_tunggu: "nickname_key = 'dimas'", peninjau: "email = 'bima@kajar.test'",
        guru: "email = 'sari@kajar.test'", koordinator: "email = 'lestari@kajar.test'", admin: "email = 'admin@kajar.test'",
      }[account];
      u = one(`SELECT * FROM users WHERE ${who} AND status = 'aktif'`);
      if (!u) fail(404, 'AKUN_DEMO_HILANG', 'Akun demo tidak ditemukan. Muat ulang halaman lalu coba lagi.');
    }
    audit(u.id, 'masuk_demo', 'users', u.id, { account });
    createSession(res, u.id);
    return { me: meView(u), home: u.role === 'student' ? (u.onboarded ? '/beranda' : '/mulai') : '/' };
  });

  r.post('/api/auth/logout', ({ req, res }) => {
    destroySession(req, res);
    return { ok: true };
  });

  r.get('/api/me', ({ user }) => {
    if (!user) return { me: null };
    return { me: meView(user) };
  });
}
