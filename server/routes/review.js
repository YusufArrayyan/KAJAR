// Reviewer API (PRD 5.6, 8.2): training, queue, anonymised detail, verdicts, escalation, contribution.
import { one, all, insert, update, audit, tx } from '../db.js';
import { fail, check } from '../http.js';
import { requireRole } from '../auth.js';
import { getSetting } from '../settings.js';
import { CALIBRATION } from '../content.js';
import { REASON_LABEL, notify } from '../queue.js';
import { COPY } from '../ai/pipeline.js';
import { verifyClaims } from '../ai/mathcheck.js';

const reviewer = requireRole('reviewer');
export const VERDICTS = ['benar', 'perlu_koreksi', 'salah_berbahaya', 'di_luar_kemampuan'];
const RUBRIC_KEYS = ['kebenaran', 'kejelasan', 'tingkat', 'keamanan'];

export const TRAINING = {
  minutes: 30,
  sections: [
    { title: 'Tujuan', body: 'Kamu memeriksa jawaban AI yang ditandai bermasalah dan sebagian sampel acak. Tugasmu menilai apakah jawaban benar, jelas, sesuai tingkat siswa SMA kelas X, dan aman. Koreksimu sampai ke siswa sebagai “Catatan dari Kak [nama panggilanmu]”.' },
    { title: 'Rubrik', body: 'Nilai empat butir dengan skala 1–4: kebenaran, kejelasan, kesesuaian tingkat, dan keamanan. Vonis Benar berarti semua butir minimal 3. Perlu koreksi berarti ada butir bernilai 2. Salah dan berbahaya berarti kebenaran atau keamanan bernilai 1. Pilih Di luar kemampuan saya kalau kamu tidak menguasai materinya; item akan diteruskan ke peninjau lain.' },
    { title: 'Tangga petunjuk', body: 'Tutor sengaja tidak memberi jawaban akhir sebelum petunjuk tingkat 4. Jawaban AI yang berupa pertanyaan penuntun bukan kesalahan. Yang perlu dikoreksi adalah rumus atau konsep yang keliru, hitungan yang salah, atau penjelasan yang membingungkan.' },
    { title: 'Aturan keamanan', body: 'Jangan mencari tahu identitas siswa. Jangan membagikan isi percakapan ke luar sistem, termasuk tangkapan layar. Kalau ada tanda siswa dalam bahaya, tekan “Teruskan ke guru”; jangan menasihati sendiri. Pesan berisiko tinggi tidak akan muncul di antreanmu karena hanya ditangani orang dewasa.' },
    { title: 'Menulis koreksi', body: 'Tulis maksimal 600 karakter, bahasa sederhana, dan tetap mengajak siswa mencoba. Contoh: “Tambahan: pada perkalian bilangan berpangkat dengan pokok sama, pangkatnya dijumlahkan. Coba hitung lagi 2^3 × 2^2.”' },
  ],
};

function trained(userId) {
  return Boolean(one('SELECT id FROM reviewer_training WHERE user_id = ? AND passed_at IS NOT NULL', userId));
}

function requireTrained(user) {
  reviewer({ user });
  if (!trained(user.id)) fail(403, 'BELUM_PELATIHAN', 'Selesaikan pelatihan dan kalibrasi dulu sebelum membuka antrean.');
}

// Appendix B: verdict must agree with rubric scores.
export function verdictAllowed(verdict, rubric) {
  const v = RUBRIC_KEYS.map((k) => rubric[k]);
  if (verdict === 'benar') return v.every((x) => x >= 3);
  if (verdict === 'salah_berbahaya') return rubric.kebenaran === 1 || rubric.keamanan === 1;
  if (verdict === 'perlu_koreksi') return v.some((x) => x <= 2);
  return true;
}

export function suggestVerdict(rubric) {
  if (rubric.kebenaran === 1 || rubric.keamanan === 1) return 'salah_berbahaya';
  if (RUBRIC_KEYS.some((k) => rubric[k] <= 2)) return 'perlu_koreksi';
  return 'benar';
}

function queueRows(userId) {
  return all(
    `SELECT f.id, f.source, f.priority, f.created_at, f.message_id, m.role, m.conversation_id, t.name AS topic, t.slug
     FROM flags f JOIN messages m ON m.id = f.message_id LEFT JOIN topics t ON t.id = m.topic_id
     WHERE f.status = 'terbuka' AND f.audience = 'peninjau'
       AND NOT EXISTS (SELECT 1 FROM reviews r WHERE r.flag_id = f.id AND r.reviewer_id = ?)
     ORDER BY f.priority ASC, f.created_at ASC`, userId,
  );
}

export default function register(r) {
  r.get('/api/review/training', ({ user }) => {
    reviewer({ user });
    const last = one('SELECT score, passed_at, created_at FROM reviewer_training WHERE user_id = ? ORDER BY created_at DESC LIMIT 1', user.id);
    return {
      ...TRAINING,
      pass_score: getSetting('reviewer_pass_score'),
      items: CALIBRATION.map((c, i) => ({ no: i + 1, q: c.q, a: c.a })),
      last: last || null,
      passed: trained(user.id),
    };
  });

  r.post('/api/review/training', ({ user, body }) => {
    reviewer({ user });
    const answers = Array.isArray(body.answers) ? body.answers : [];
    if (answers.length !== CALIBRATION.length || answers.some((a) => !VERDICTS.includes(a))) {
      fail(400, 'BELUM_LENGKAP', `Jawab semua ${CALIBRATION.length} soal kalibrasi dulu.`);
    }
    const correct = answers.filter((a, i) => a === CALIBRATION[i].verdict).length;
    const score = Math.round((correct / CALIBRATION.length) * 100);
    const passed = score >= getSetting('reviewer_pass_score');
    insert('reviewer_training', { user_id: user.id, score, passed_at: passed ? new Date().toISOString() : null });
    audit(user.id, 'kalibrasi_peninjau', 'reviewer_training', user.id, { score, passed });
    return {
      score, passed,
      feedback: CALIBRATION.map((c, i) => ({ no: i + 1, yours: answers[i], expected: c.verdict, why: c.why, ok: answers[i] === c.verdict })),
    };
  });

  r.get('/api/review/queue', ({ user, query }) => {
    requireTrained(user);
    const reason = query.get('alasan');
    const topic = query.get('topik');
    const rows = queueRows(user.id)
      .filter((x) => !reason || reason === 'semua' || x.source === reason || (reason === 'ditandai' && ['siswa_salah', 'siswa_bingung'].includes(x.source)))
      .filter((x) => !topic || x.slug === topic);
    const sla = getSetting('sla_hours') * 3600e3;
    return {
      total: queueRows(user.id).length,
      items: rows.map((x) => ({
        id: x.id, topic: x.topic || 'Tanpa topik', reason: x.source, reason_label: REASON_LABEL[x.source],
        priority: x.priority, created_at: x.created_at, overdue: Date.now() - new Date(x.created_at) > sla,
      })),
      topics: all('SELECT slug, name FROM topics ORDER BY ord'),
    };
  });

  r.get('/api/review/items/:id', ({ user, params }) => {
    requireTrained(user);
    const f = one("SELECT * FROM flags WHERE id = ? AND audience = 'peninjau'", params.id);
    if (!f) fail(404, 'TIDAK_DITEMUKAN', 'Item tidak ditemukan atau sudah ditangani orang dewasa.');
    const target = one('SELECT m.*, t.name AS topic FROM messages m LEFT JOIN topics t ON t.id = m.topic_id WHERE m.id = ?', f.message_id);
    // F-REV-2: six messages of context, no student identity, only role labels.
    const context = all(
      'SELECT id, role, content_redacted, hint_level, status, author_name, created_at FROM messages WHERE conversation_id = ? AND created_at <= ? ORDER BY created_at DESC, rowid DESC LIMIT 6',
      target.conversation_id, target.created_at,
    ).reverse().map((m) => ({
      id: m.id, role: m.role, text: m.content_redacted, hint_level: m.hint_level, target: m.id === target.id,
      label: m.role === 'student' ? 'Siswa' : m.role === 'ai' ? 'Jawaban AI' : m.role === 'reviewer' ? `Catatan Kak ${m.author_name}` : 'Sistem',
      retracted: m.status === 'dicabut',
    }));
    if (!context.some((c) => c.target)) context.push({ id: target.id, role: target.role, text: target.content_redacted, target: true, label: 'Jawaban AI' });
    const chunks = target.topic_id ? all("SELECT kind, text, source_ref FROM content_chunks WHERE topic_id = ? AND kind IN ('materi','contoh') AND status = 'terbit'", target.topic_id) : [];
    const tool = target.tool_check ? JSON.parse(target.tool_check) : (target.role === 'ai' ? verifyClaims(target.content_redacted) : null);
    const others = all('SELECT verdict FROM reviews WHERE flag_id = ?', f.id).length;
    return {
      id: f.id, reason: f.source, reason_label: REASON_LABEL[f.source], topic: target.topic, created_at: f.created_at,
      context, references: chunks, tool_check: tool, confidence: target.confidence, hint_level: target.hint_level,
      needs_reviews: f.needs_reviews, reviews_done: others, is_ai: target.role === 'ai',
    };
  });

  r.post('/api/review/items/:id', ({ user, params, body }) => {
    requireTrained(user);
    const f = one("SELECT * FROM flags WHERE id = ? AND audience = 'peninjau' AND status = 'terbuka'", params.id);
    if (!f) fail(409, 'SUDAH_DITANGANI', 'Item ini sudah ditangani. Lanjut ke item berikutnya.');
    if (one('SELECT id FROM reviews WHERE flag_id = ? AND reviewer_id = ?', f.id, user.id)) fail(409, 'SUDAH_DINILAI', 'Kamu sudah menilai item ini.');
    const v = check(body, {
      verdict: { type: 'string', oneOf: VERDICTS, label: 'Vonis' },
      rubric: { type: 'object', label: 'Rubrik' },
      correction: { type: 'string', label: 'Koreksi', max: 600, optional: true, default: '' },
      seconds: { type: 'int', label: 'Durasi', min: 0, max: 86400, optional: true, default: 0 },
    });
    const rubric = {};
    for (const k of RUBRIC_KEYS) {
      const x = Number(v.rubric[k]);
      if (!Number.isInteger(x) || x < 1 || x > 4) fail(400, 'RUBRIK_BELUM_LENGKAP', 'Isi keempat butir rubrik dengan nilai 1 sampai 4.', { field: k });
      rubric[k] = x;
    }
    if (v.verdict !== 'di_luar_kemampuan' && !verdictAllowed(v.verdict, rubric)) {
      fail(400, 'VONIS_TIDAK_SESUAI', `Vonis belum sesuai rubrik. Berdasarkan nilai rubrik, vonis yang cocok: ${suggestVerdict(rubric).replace('_', ' ')}.`);
    }
    if (v.verdict === 'perlu_koreksi' && !v.correction) fail(400, 'KOREKSI_KOSONG', 'Tulis catatan koreksi singkat untuk siswa.', { field: 'correction' });
    const target = one('SELECT * FROM messages WHERE id = ?', f.message_id);

    tx(() => {
      insert('reviews', {
        message_id: target.id, flag_id: f.id, reviewer_id: user.id, rubric: JSON.stringify(rubric), verdict: v.verdict,
        correction_text: v.correction || null, seconds_spent: v.seconds,
      });
      // F-REV-4: correction note shown to the student, styled apart from AI text.
      if ((v.verdict === 'perlu_koreksi' || v.verdict === 'salah_berbahaya') && v.correction) {
        insert('messages', {
          conversation_id: target.conversation_id, role: 'reviewer', author_name: user.display_name, reply_to: target.id,
          content_redacted: v.correction, status: 'terkirim', seen: 0,
        });
      }
      // F-REV-5: dangerous answers are retracted and logged.
      if (v.verdict === 'salah_berbahaya' && target.role === 'ai') {
        update('messages', target.id, { status: 'dicabut' });
        insert('messages', { conversation_id: target.conversation_id, role: 'system', reply_to: target.id, content_redacted: COPY.retracted, status: 'terkirim', seen: 0 });
        const cls = one('SELECT u.class_id FROM conversations c JOIN users u ON u.id = c.user_id WHERE c.id = ?', target.conversation_id);
        insert('safety_events', { message_id: target.id, class_id: cls?.class_id, category: 'jawaban_dicabut', severity: 'sedang', status: 'selesai', note: 'Dicabut otomatis karena vonis peninjau “Salah dan berbahaya”.', handled_by: user.id });
      }
      audit(user.id, 'tinjau', 'flags', f.id, { verdict: v.verdict });

      const counted = all("SELECT verdict FROM reviews WHERE flag_id = ? AND verdict != 'di_luar_kemampuan'", f.id);
      if (counted.length >= f.needs_reviews) {
        update('flags', f.id, { status: 'selesai' });
        if (f.needs_reviews > 1 && new Set(counted.map((x) => x.verdict)).size > 1) {
          notify('coordinator', 'kalibrasi', 'Dua peninjau berbeda vonis pada satu item. Bahas di pertemuan kalibrasi.', { link: '/dasbor/program' });
        }
      }
    });
    return { ok: true, next: queueRows(user.id)[0]?.id || null };
  });

  r.post('/api/review/items/:id/escalate', ({ user, params, body }) => {
    requireTrained(user);
    const f = one("SELECT * FROM flags WHERE id = ? AND status = 'terbuka'", params.id);
    if (!f) fail(404, 'TIDAK_DITEMUKAN', 'Item tidak ditemukan.');
    const { note } = check(body, { note: { type: 'string', label: 'Catatan', max: 600, optional: true, default: '' } });
    update('flags', f.id, { status: 'diteruskan', escalated_to: 'guru', audience: 'dewasa' });
    const cls = one('SELECT u.class_id, u.school_id FROM messages m JOIN conversations c ON c.id = m.conversation_id JOIN users u ON u.id = c.user_id WHERE m.id = ?', f.message_id);
    const ev = insert('safety_events', { message_id: f.message_id, class_id: cls?.class_id, category: 'diteruskan_peninjau', severity: 'sedang', status: 'baru', note: note || null, handled_by: null });
    for (const role of ['teacher', 'coordinator']) {
      notify(role, 'eskalasi', 'Peninjau meneruskan satu item untuk ditangani guru.', { schoolId: cls?.school_id, link: `/dasbor/insiden#${ev.id}` });
    }
    audit(user.id, 'teruskan', 'flags', f.id, { note: Boolean(note) });
    return { ok: true, next: queueRows(user.id)[0]?.id || null };
  });

  r.get('/api/review/contribution', ({ user }) => {
    reviewer({ user });
    return contribution(user.id);
  });

  r.get('/api/review/contribution.csv', ({ user, res }) => {
    reviewer({ user });
    const c = contribution(user.id);
    const lines = ['minggu_mulai,jumlah_item,menit', ...c.weeks.map((w) => `${w.week},${w.items},${w.minutes}`), `total,${c.items},${c.minutes}`];
    res.setHeader('Content-Disposition', 'attachment; filename="ringkasan-kontribusi.csv"');
    return { __raw: lines.join('\n'), type: 'text/csv; charset=utf-8' };
  });
}

function weekStart(iso) {
  const d = new Date(iso);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

export function contribution(userId) {
  const rows = all('SELECT flag_id, verdict, seconds_spent, created_at FROM reviews WHERE reviewer_id = ? ORDER BY created_at', userId);
  const weeks = new Map();
  for (const r of rows) {
    const w = weekStart(r.created_at);
    const x = weeks.get(w) || { week: w, items: 0, seconds: 0 };
    x.items += 1;
    x.seconds += r.seconds_spent || 0;
    weeks.set(w, x);
  }
  // Agreement: share of my double-reviewed items where the other reviewer gave the same verdict.
  const doubles = all(
    `SELECT r1.verdict AS mine, r2.verdict AS other FROM reviews r1 JOIN reviews r2 ON r2.flag_id = r1.flag_id AND r2.reviewer_id != r1.reviewer_id
     WHERE r1.reviewer_id = ?`, userId,
  );
  const secs = rows.reduce((s, r) => s + (r.seconds_spent || 0), 0);
  return {
    items: rows.length,
    minutes: Math.round(secs / 60),
    avg_seconds: rows.length ? Math.round(secs / rows.length) : 0,
    agreement: doubles.length ? Math.round((doubles.filter((d) => d.mine === d.other).length / doubles.length) * 100) : null,
    weeks: [...weeks.values()].map((w) => ({ week: w.week, items: w.items, minutes: Math.round(w.seconds / 60) })).reverse(),
    note: 'Bentuk pengakuan (SKS atau surat keterangan pengabdian) ditentukan kampus.',
  };
}
