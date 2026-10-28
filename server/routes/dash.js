// Teacher and coordinator API (PRD 5.7, 8.3 K1–K9). Aggregates by class; pseudonyms only in exports.
import { one, all, insert, update, run, audit, now, tx } from '../db.js';
import { fail, check } from '../http.js';
import { requireRole, newJoinCode, hashJoinCode, hashSecret } from '../auth.js';
import { getSetting, setSetting } from '../settings.js';
import { overdueCount } from '../queue.js';
import { consentState } from './auth.js';
import { randomInt } from 'node:crypto';

const staff = requireRole('teacher', 'coordinator');
const coordinator = requireRole('coordinator');
const daysAgo = (d) => new Date(Date.now() - d * 864e5).toISOString();

function classesFor(user, classParam) {
  const rows = all('SELECT * FROM classes WHERE school_id = ? ORDER BY name', user.school_id);
  if (classParam && classParam !== 'semua') return rows.filter((c) => c.id === classParam);
  return rows;
}
const ids = (rows) => rows.map((r) => r.id);
const inList = (arr) => (arr.length ? arr.map(() => '?').join(',') : "''");

function median(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function weekKey(iso) {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

const csvCell = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (header, rows) => [header.join(','), ...rows.map((r) => header.map((h) => csvCell(r[h])).join(','))].join('\n');

export default function register(r) {
  r.get('/api/dash/classes', ({ user }) => {
    staff({ user });
    return { classes: classesFor(user).map((c) => ({ id: c.id, name: c.name })) };
  });

  // K1 Ikhtisar
  r.get('/api/dash/overview', ({ user, query }) => {
    staff({ user });
    const cls = ids(classesFor(user, query.get('kelas')));
    const studentIds = all(`SELECT id FROM users WHERE role = 'student' AND class_id IN (${inList(cls)})`, ...cls).map((u) => u.id);
    const sIn = inList(studentIds);
    const since7 = daysAgo(7);
    const active = all(
      `SELECT DISTINCT user_id FROM (
         SELECT c.user_id FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE m.role = 'student' AND m.created_at >= ? AND c.user_id IN (${sIn})
         UNION SELECT user_id FROM attempts WHERE created_at >= ? AND user_id IN (${sIn}))`,
      since7, ...studentIds, since7, ...studentIds,
    ).length;
    const perDay = all(
      `SELECT substr(m.created_at, 1, 10) AS day, COUNT(*) AS n FROM messages m JOIN conversations c ON c.id = m.conversation_id
       WHERE m.role = 'student' AND m.created_at >= ? AND c.user_id IN (${sIn}) GROUP BY day ORDER BY day`, daysAgo(14), ...studentIds,
    );
    const days = [];
    for (let i = 13; i >= 0; i--) {
      const d = daysAgo(i).slice(0, 10);
      days.push({ day: d, n: perDay.find((x) => x.day === d)?.n || 0 });
    }
    const topTopics = all(
      `SELECT t.name, COUNT(*) AS n FROM messages m JOIN conversations c ON c.id = m.conversation_id JOIN topics t ON t.id = m.topic_id
       WHERE m.role = 'ai' AND m.created_at >= ? AND c.user_id IN (${sIn}) GROUP BY t.id ORDER BY n DESC LIMIT 5`, daysAgo(28), ...studentIds,
    );
    const hard = all(
      `SELECT t.name, SUM(CASE WHEN m.hint_level >= 3 THEN 1 ELSE 0 END) AS deep, COUNT(*) AS n FROM messages m
       JOIN conversations c ON c.id = m.conversation_id JOIN topics t ON t.id = m.topic_id
       WHERE m.role = 'ai' AND m.created_at >= ? AND c.user_id IN (${sIn}) GROUP BY t.id HAVING deep > 0 ORDER BY deep DESC LIMIT 5`, daysAgo(28), ...studentIds,
    );
    const practiceHard = all(
      `SELECT t.name, SUM(CASE WHEN a.hints_used >= 3 THEN 1 ELSE 0 END) AS deep, COUNT(*) AS n FROM attempts a
       JOIN questions q ON q.id = a.question_id JOIN topics t ON t.id = q.topic_id
       WHERE a.created_at >= ? AND a.user_id IN (${sIn}) GROUP BY t.id HAVING deep > 0 ORDER BY deep DESC LIMIT 5`, daysAgo(28), ...studentIds,
    );
    return {
      students: studentIds.length, active_week: active, per_day: days, top_topics: topTopics,
      hard_topics: hard, practice_hard: practiceHard,
    };
  });

  // K2 Mutu AI
  r.get('/api/dash/quality', ({ user, query }) => {
    staff({ user });
    const topic = query.get('topik');
    const rows = all(
      `SELECT r.verdict, r.created_at, t.slug, t.name AS topic, m.content_redacted AS answer, r.correction_text, m.id AS message_id
       FROM reviews r JOIN messages m ON m.id = r.message_id LEFT JOIN topics t ON t.id = m.topic_id
       JOIN conversations c ON c.id = m.conversation_id JOIN users u ON u.id = c.user_id
       WHERE u.school_id = ? AND r.created_at >= ? ORDER BY r.created_at`, user.school_id, daysAgo(7 * 6),
    ).filter((x) => !topic || topic === 'semua' || x.slug === topic);
    const byWeek = new Map();
    for (const x of rows) {
      const w = weekKey(x.created_at);
      const b = byWeek.get(w) || { week: w, benar: 0, perlu_koreksi: 0, salah_berbahaya: 0, di_luar_kemampuan: 0, total: 0 };
      b[x.verdict] += 1;
      b.total += 1;
      byWeek.set(w, b);
    }
    const total = rows.length;
    const count = (v) => rows.filter((x) => x.verdict === v).length;
    const examples = rows.filter((x) => x.verdict === 'perlu_koreksi' || x.verdict === 'salah_berbahaya').slice(-6).reverse()
      .map((x) => ({ topic: x.topic, verdict: x.verdict, answer: x.answer, correction: x.correction_text, at: x.created_at }));
    return {
      total,
      share: total ? {
        benar: Math.round((count('benar') / total) * 100), perlu_koreksi: Math.round((count('perlu_koreksi') / total) * 100),
        salah_berbahaya: Math.round((count('salah_berbahaya') / total) * 100), di_luar_kemampuan: Math.round((count('di_luar_kemampuan') / total) * 100),
      } : null,
      weeks: [...byWeek.values()],
      examples,
      topics: all('SELECT slug, name FROM topics ORDER BY ord'),
    };
  });

  // K3 Program
  r.get('/api/dash/program', ({ user }) => {
    staff({ user });
    const reviewers = all("SELECT id, display_name FROM users WHERE role = 'reviewer' AND status = 'aktif'");
    const activeRev = all('SELECT DISTINCT reviewer_id FROM reviews WHERE created_at >= ?', daysAgo(14)).length;
    const waits = all(
      `SELECT f.created_at AS f_at, MIN(r.created_at) AS r_at FROM flags f JOIN reviews r ON r.flag_id = f.id
       WHERE f.created_at >= ? GROUP BY f.id`, daysAgo(28),
    ).map((x) => (new Date(x.r_at) - new Date(x.f_at)) / 3600e3);
    const pending = one("SELECT COUNT(*) n FROM flags WHERE status = 'terbuka' AND audience = 'peninjau'").n;
    const doubles = all("SELECT flag_id, GROUP_CONCAT(verdict) AS v, COUNT(*) AS n FROM reviews WHERE verdict != 'di_luar_kemampuan' GROUP BY flag_id HAVING n >= 2");
    const agree = doubles.length ? Math.round((doubles.filter((d) => new Set(d.v.split(',')).size === 1).length / doubles.length) * 100) : null;
    const overdue = overdueCount();
    return {
      reviewers_total: reviewers.length, reviewers_active: activeRev,
      median_wait_hours: waits.length ? Math.round(median(waits) * 10) / 10 : null,
      pending, overdue, agreement: agree, double_reviewed: doubles.length,
      sla_hours: getSetting('sla_hours'),
      alert: overdue > 0 ? `${overdue} item menunggu lebih dari ${getSetting('sla_hours')} jam. Tambah jadwal peninjau atau turunkan persentase sampel acak.` : null,
    };
  });

  // K4 Hasil tes
  r.get('/api/dash/assessments', ({ user }) => {
    staff({ user });
    const classes = classesFor(user);
    const out = classes.map((c) => {
      const rows = all("SELECT a.kind, a.score_raw FROM assessments a JOIN users u ON u.id = a.user_id WHERE u.class_id = ? AND a.finished_at IS NOT NULL", c.id);
      const summarize = (kind) => {
        const xs = rows.filter((x) => x.kind === kind).map((x) => x.score_raw);
        const dist = [0, 0, 0, 0, 0];
        for (const s of xs) dist[Math.min(4, Math.floor(s / 3.01))] += 1;
        return { n: xs.length, mean: xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null, dist };
      };
      return { id: c.id, name: c.name, group: c.comparison_group, awal: summarize('awal'), akhir: summarize('akhir') };
    });
    return {
      classes: out, total_items: 15, buckets: ['0–3', '4–6', '7–9', '10–12', '13–15'],
      posttest_open: Boolean(getSetting('posttest_open')),
      limitation: 'Perbedaan skor belum tentu disebabkan oleh program. Kelas tidak dipilih acak, jumlah siswa kecil, dan banyak hal lain di luar KAJAR ikut memengaruhi.',
    };
  });

  r.post('/api/dash/posttest', ({ user, body }) => {
    coordinator({ user });
    setSetting('posttest_open', Boolean(body.open), user.id);
    return { posttest_open: Boolean(body.open) };
  });

  // K5 Kelas
  r.get('/api/classes', ({ user }) => {
    staff({ user });
    return {
      classes: classesFor(user).map((c) => ({
        id: c.id, name: c.name, grade: c.grade, group: c.comparison_group, code_active: Boolean(c.join_code_active),
        students: one("SELECT COUNT(*) n FROM users WHERE role = 'student' AND class_id = ? AND status = 'aktif'", c.id).n,
        consent: consentState(c.id),
      })),
      deletion_requests: all("SELECT d.id, d.pseudonym, d.created_at, c.name AS class_name FROM deletion_requests d LEFT JOIN classes c ON c.id = d.class_id WHERE d.status = 'baru' ORDER BY d.created_at"),
    };
  });

  r.post('/api/classes', ({ user, body }) => {
    coordinator({ user });
    const v = check(body, {
      name: { type: 'string', label: 'Nama kelas', max: 30, min: 1 },
      grade: { type: 'string', label: 'Tingkat', max: 4, optional: true, default: 'X' },
      group: { type: 'string', label: 'Kelompok', oneOf: ['intervensi', 'pembanding', ''], optional: true, default: '' },
    });
    const code = newJoinCode();
    const c = insert('classes', { school_id: user.school_id, name: v.name, grade: v.grade, join_code_hash: hashJoinCode(code), join_code_active: 1, comparison_group: v.group || null });
    audit(user.id, 'buat_kelas', 'classes', c.id, { name: v.name });
    return { id: c.id, code, message: 'Catat kode ini sekarang. Demi keamanan, kode tidak bisa dilihat lagi; buat kode baru kalau lupa.' };
  });

  r.post('/api/classes/:id/code', ({ user, params, body }) => {
    coordinator({ user });
    const c = one('SELECT * FROM classes WHERE id = ? AND school_id = ?', params.id, user.school_id);
    if (!c) fail(404, 'KELAS_TIDAK_ADA', 'Kelas tidak ditemukan.');
    const { action } = check(body, { action: { type: 'string', oneOf: ['nonaktif', 'baru'], label: 'Aksi' } });
    if (action === 'nonaktif') {
      update('classes', c.id, { join_code_active: 0 });
      audit(user.id, 'nonaktifkan_kode', 'classes', c.id);
      return { ok: true };
    }
    const code = newJoinCode();
    update('classes', c.id, { join_code_hash: hashJoinCode(code), join_code_active: 1 });
    audit(user.id, 'kode_kelas_baru', 'classes', c.id);
    return { code };
  });

  r.get('/api/classes/:id/students', ({ user, params }) => {
    staff({ user });
    const c = one('SELECT * FROM classes WHERE id = ? AND school_id = ?', params.id, user.school_id);
    if (!c) fail(404, 'KELAS_TIDAK_ADA', 'Kelas tidak ditemukan.');
    return {
      students: all("SELECT id, display_name AS nickname, pseudonym, locked_until FROM users WHERE role = 'student' AND class_id = ? AND status = 'aktif' ORDER BY display_name", c.id)
        .map((s) => ({ ...s, locked: Boolean(s.locked_until && s.locked_until > now()) })),
    };
  });

  // F-AUTH-3: teacher or coordinator resets a forgotten PIN; the temporary PIN is shown once.
  r.post('/api/classes/:id/reset-pin', ({ user, params, body }) => {
    staff({ user });
    const s = one("SELECT u.* FROM users u JOIN classes c ON c.id = u.class_id WHERE u.id = ? AND u.class_id = ? AND c.school_id = ? AND u.role = 'student'", body.user_id, params.id, user.school_id);
    if (!s) fail(404, 'SISWA_TIDAK_ADA', 'Siswa tidak ditemukan di kelas ini.');
    const pin = String(randomInt(100000, 999999));
    update('users', s.id, { pin_hash: hashSecret(pin), failed_logins: 0, locked_until: null });
    run('DELETE FROM sessions WHERE user_id = ?', s.id);
    audit(user.id, 'atur_ulang_pin', 'users', s.id);
    return { pin, message: `Berikan PIN sementara ini langsung ke ${s.display_name}. PIN hanya tampil sekali.` };
  });

  // K6 Persetujuan (F-DASH-6)
  r.post('/api/classes/:id/consent', ({ user, params, body }) => {
    coordinator({ user });
    const c = one('SELECT * FROM classes WHERE id = ? AND school_id = ?', params.id, user.school_id);
    if (!c) fail(404, 'KELAS_TIDAK_ADA', 'Kelas tidak ditemukan.');
    const v = check(body, {
      type: { type: 'string', oneOf: ['sekolah', 'wali'], label: 'Jenis persetujuan' },
      action: { type: 'string', oneOf: ['catat', 'cabut'], label: 'Aksi', optional: true, default: 'catat' },
      note: { type: 'string', label: 'Catatan', max: 300, optional: true, default: '' },
    });
    if (v.action === 'cabut') {
      run('DELETE FROM consents WHERE class_id = ? AND type = ?', c.id, v.type);
    } else if (!one('SELECT id FROM consents WHERE class_id = ? AND type = ?', c.id, v.type)) {
      insert('consents', { class_id: c.id, type: v.type, recorded_by: user.id, recorded_at: now(), note: v.note || null });
    }
    audit(user.id, `persetujuan_${v.action}`, 'consents', c.id, { type: v.type });
    return { consent: consentState(c.id) };
  });

  // F-CONS-3: execute a deletion request. Cascades remove conversations, messages, attempts, assessments.
  r.post('/api/deletion-requests/:id/execute', ({ user, params }) => {
    coordinator({ user });
    const d = one("SELECT * FROM deletion_requests WHERE id = ? AND status = 'baru'", params.id);
    if (!d) fail(404, 'TIDAK_DITEMUKAN', 'Permintaan tidak ditemukan atau sudah diproses.');
    tx(() => {
      if (d.user_id) {
        run('DELETE FROM reviews WHERE message_id IN (SELECT m.id FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.user_id = ?)', d.user_id);
        run('DELETE FROM users WHERE id = ?', d.user_id);
      }
      update('deletion_requests', d.id, { status: 'selesai' });
      audit(user.id, 'hapus_data_siswa', 'deletion_requests', d.id, { pseudonym: d.pseudonym });
    });
    return { ok: true };
  });

  // K7 Peninjau
  r.get('/api/reviewers', ({ user }) => {
    staff({ user });
    return {
      reviewers: all("SELECT id, display_name, email FROM users WHERE role = 'reviewer' AND status = 'aktif' ORDER BY display_name").map((u) => {
        const t = one('SELECT score, passed_at FROM reviewer_training WHERE user_id = ? ORDER BY created_at DESC LIMIT 1', u.id);
        return {
          ...u, training: t ? (t.passed_at ? 'lulus' : 'ulangi') : 'belum',
          reviews_14d: one('SELECT COUNT(*) n FROM reviews WHERE reviewer_id = ? AND created_at >= ?', u.id, daysAgo(14)).n,
          minutes_14d: Math.round(one('SELECT COALESCE(SUM(seconds_spent),0) s FROM reviews WHERE reviewer_id = ? AND created_at >= ?', u.id, daysAgo(14)).s / 60),
        };
      }),
    };
  });

  r.post('/api/reviewers', ({ user, body }) => {
    coordinator({ user });
    const v = check(body, {
      name: { type: 'string', label: 'Nama panggilan', min: 2, max: 30 },
      email: { type: 'string', label: 'Email', max: 120, pattern: /^[^@\s]+@[^@\s]+\.[^@\s]+$/, msg: 'Email belum lengkap. Contoh: nama@kampus.ac.id' },
    });
    if (one('SELECT id FROM users WHERE email = ?', v.email.toLowerCase())) fail(409, 'EMAIL_DIPAKAI', 'Email ini sudah terdaftar.', { field: 'email' });
    const temp = `kajar-${randomInt(100000, 999999)}`;
    const u = insert('users', { role: 'reviewer', email: v.email.toLowerCase(), display_name: v.name, password_hash: hashSecret(temp), school_id: user.school_id, status: 'aktif', onboarded: 1, prefs: '{}' });
    audit(user.id, 'undang_peninjau', 'users', u.id);
    return { id: u.id, temp_password: temp, message: 'Kirim kata sandi sementara ini lewat jalur pribadi. Peninjau juga bisa masuk lewat tautan email.' };
  });

  // K8 Insiden: adults only; content shown only for incidents they handle.
  r.get('/api/incidents', ({ user }) => {
    staff({ user });
    const rows = all(
      `SELECT e.*, c.name AS class_name, m.content_redacted AS text FROM safety_events e
       LEFT JOIN classes c ON c.id = e.class_id LEFT JOIN messages m ON m.id = e.message_id
       WHERE (c.school_id = ? OR e.class_id IS NULL) ORDER BY CASE e.status WHEN 'baru' THEN 0 WHEN 'ditangani' THEN 1 ELSE 2 END, e.created_at DESC LIMIT 100`, user.school_id,
    );
    return { incidents: rows.map((e) => ({ id: e.id, category: e.category, severity: e.severity, status: e.status, note: e.note, class_name: e.class_name, created_at: e.created_at, text: e.status !== 'selesai' ? e.text : null })) };
  });

  r.post('/api/incidents/:id', ({ user, params, body }) => {
    staff({ user });
    const e = one('SELECT * FROM safety_events WHERE id = ?', params.id);
    if (!e) fail(404, 'TIDAK_DITEMUKAN', 'Insiden tidak ditemukan.');
    const v = check(body, {
      status: { type: 'string', oneOf: ['baru', 'ditangani', 'selesai'], label: 'Status' },
      note: { type: 'string', label: 'Catatan', max: 600, optional: true, default: '' },
    });
    update('safety_events', e.id, { status: v.status, note: v.note || e.note, handled_by: user.id });
    if (v.status === 'selesai') run("UPDATE flags SET status = 'selesai' WHERE message_id = ? AND audience = 'dewasa'", e.message_id);
    audit(user.id, 'tindak_lanjut_insiden', 'safety_events', e.id, { status: v.status });
    return { ok: true };
  });

  r.get('/api/notifications', ({ user }) => {
    if (!user || user.role === 'student') fail(403, 'TIDAK_BERWENANG', 'Halaman ini bukan untuk akunmu.');
    const rows = all('SELECT id, kind, body, link, read_at, created_at FROM notifications WHERE audience_role = ? AND (school_id IS NULL OR school_id = ?) ORDER BY created_at DESC LIMIT 20', user.role, user.school_id);
    return { notifications: rows, unread: rows.filter((n) => !n.read_at).length };
  });

  r.post('/api/notifications/read', ({ user }) => {
    if (!user || user.role === 'student') fail(403, 'TIDAK_BERWENANG', 'Halaman ini bukan untuk akunmu.');
    run('UPDATE notifications SET read_at = ? WHERE audience_role = ? AND read_at IS NULL', now(), user.role);
    return { ok: true };
  });

  // K9 Ekspor: pseudonymised CSV, no names and no conversation text (F-DASH-5).
  r.get('/api/export/csv', ({ user, query, res }) => {
    coordinator({ user });
    const type = query.get('type');
    const cls = Object.fromEntries(all('SELECT id, name, comparison_group FROM classes WHERE school_id = ?', user.school_id).map((c) => [c.id, c]));
    let csv;
    if (type === 'tes') {
      const rows = all("SELECT u.pseudonym, u.class_id, a.kind, a.score_raw, a.finished_at FROM assessments a JOIN users u ON u.id = a.user_id WHERE u.school_id = ? AND a.finished_at IS NOT NULL ORDER BY u.pseudonym, a.kind", user.school_id)
        .map((x) => ({ id_siswa: x.pseudonym, kelas: cls[x.class_id]?.name, kelompok: cls[x.class_id]?.comparison_group, tes: x.kind, skor: x.score_raw, maks: 15, selesai: x.finished_at.slice(0, 10) }));
      csv = toCsv(['id_siswa', 'kelas', 'kelompok', 'tes', 'skor', 'maks', 'selesai'], rows);
    } else if (type === 'aktivitas') {
      const rows = all(
        `SELECT u.pseudonym, u.class_id,
          (SELECT COUNT(*) FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.user_id = u.id AND m.role = 'student') AS pertanyaan,
          (SELECT COUNT(*) FROM attempts a WHERE a.user_id = u.id) AS latihan,
          (SELECT COUNT(*) FROM attempts a WHERE a.user_id = u.id AND a.correct = 1) AS latihan_benar,
          (SELECT COUNT(*) FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.user_id = u.id AND m.role = 'ai' AND m.hint_level >= 4) AS petunjuk_l4,
          (SELECT COUNT(*) FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.user_id = u.id AND m.role = 'ai' AND m.hint_level BETWEEN 1 AND 3) AS petunjuk_l1_l3
         FROM users u WHERE u.role = 'student' AND u.school_id = ? ORDER BY u.pseudonym`, user.school_id,
      ).map((x) => ({ id_siswa: x.pseudonym, kelas: cls[x.class_id]?.name, pertanyaan: x.pertanyaan, latihan: x.latihan, latihan_benar: x.latihan_benar, petunjuk_l1_l3: x.petunjuk_l1_l3, petunjuk_l4: x.petunjuk_l4 }));
      csv = toCsv(['id_siswa', 'kelas', 'pertanyaan', 'latihan', 'latihan_benar', 'petunjuk_l1_l3', 'petunjuk_l4'], rows);
    } else if (type === 'mutu') {
      const rows = all("SELECT r.verdict, r.rubric, r.seconds_spent, r.created_at, t.name AS topik FROM reviews r JOIN messages m ON m.id = r.message_id LEFT JOIN topics t ON t.id = m.topic_id ORDER BY r.created_at")
        .map((x) => ({ tanggal: x.created_at.slice(0, 10), topik: x.topik, vonis: x.verdict, ...JSON.parse(x.rubric), detik: x.seconds_spent }));
      csv = toCsv(['tanggal', 'topik', 'vonis', 'kebenaran', 'kejelasan', 'tingkat', 'keamanan', 'detik'], rows);
    } else {
      fail(400, 'JENIS_EKSPOR', 'Pilih jenis ekspor: tes, aktivitas, atau mutu.');
    }
    audit(user.id, 'ekspor_csv', 'export', type);
    res.setHeader('Content-Disposition', `attachment; filename="kajar-${type}-${now().slice(0, 10)}.csv"`);
    return { __raw: '﻿' + csv, type: 'text/csv; charset=utf-8' };
  });
}
