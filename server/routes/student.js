// Student API: home, practice (5.3), assessments (5.2), free chat (5.4), feedback, privacy (5.1).
import { one, all, run, insert, update, audit, now } from '../db.js';
import { fail, check, rateLimit } from '../http.js';
import { requireRole } from '../auth.js';
import { getSetting } from '../settings.js';
import { answersMatch } from '../ai/mathcheck.js';
import { handleStudentMessage, remainingToday, COPY } from '../ai/pipeline.js';
import { addFlag } from '../queue.js';
import { consentState, meView } from './auth.js';

const student = requireRole('student');

// ---- Mastery (F-PRAC-3): transparent rules, explained to the student in the UI. -------------
export const MASTERY_RULE =
  'Belum: belum ada jawaban benar. Mulai: minimal 1 benar. Cukup: minimal 3 benar dan 3 dari 5 percobaan terakhir benar. Kuat: minimal 5 benar dan 4 dari 5 percobaan terakhir benar.';
export function masteryLevel(attempts) {
  const correct = attempts.filter((a) => a.correct).length;
  const last5 = attempts.slice(-5).filter((a) => a.correct).length;
  if (correct >= 5 && last5 >= 4) return 'kuat';
  if (correct >= 3 && last5 >= 3) return 'cukup';
  if (correct >= 1) return 'mulai';
  return 'belum';
}

function topicsWithMastery(userId) {
  const topics = all("SELECT t.id, t.slug, t.name, t.ord, (SELECT COUNT(*) FROM questions q WHERE q.topic_id = t.id AND q.assessment_pool = 'latihan' AND q.status = 'terbit') AS n_questions FROM topics t ORDER BY t.ord");
  const attempts = all('SELECT q.topic_id, a.correct, a.question_id FROM attempts a JOIN questions q ON q.id = a.question_id WHERE a.user_id = ? ORDER BY a.created_at', userId);
  return topics.map((t) => {
    const mine = attempts.filter((a) => a.topic_id === t.id);
    const solved = new Set(mine.filter((a) => a.correct).map((a) => a.question_id)).size;
    return {
      slug: t.slug, name: t.name, mastery: masteryLevel(mine), n_questions: t.n_questions, solved,
      remaining: Math.max(0, t.n_questions - solved),
      // Rough download estimate: question text + 4 steps ≈ 1 KB each, plus page chrome.
      size_kb: Math.max(4, Math.round(t.n_questions * 1.2 + 2)),
    };
  });
}

// F-PRAC-4: up to 3 recommendations, weakest pre-test topics first.
function recommendations(userId, topics) {
  const pre = one("SELECT per_topic FROM assessments WHERE user_id = ? AND kind = 'awal' AND finished_at IS NOT NULL", userId);
  if (!pre) return [];
  const per = JSON.parse(pre.per_topic || '{}');
  return topics
    .filter((t) => t.mastery !== 'kuat' && per[t.slug])
    .map((t) => ({ ...t, ratio: per[t.slug].benar / per[t.slug].total }))
    .filter((t) => t.ratio < 1)
    .sort((a, b) => a.ratio - b.ratio)
    .slice(0, 3)
    .map(({ slug }) => slug);
}

// In-memory hint state per user+question (lost on restart, which only resets hint counters).
const hintState = new Map();
const hs = (u, q) => {
  const k = `${u}:${q}`;
  if (!hintState.has(k)) hintState.set(k, { level: 0, tried: false, started: Date.now() });
  return hintState.get(k);
};
export const resetHintState = () => hintState.clear();

function practiceQuestion(q, userId) {
  const st = hs(userId, q.id);
  const shown = st.level ? all('SELECT step_no, text FROM solution_steps WHERE question_id = ? AND hint_level <= ? ORDER BY step_no', q.id, Math.min(st.level, 3)) : [];
  return {
    id: q.id, stem: q.stem, hints: shown.map((s) => ({ level: s.step_no, text: s.text })),
    hint_level: st.level, can_full: st.tried || st.level >= 2,
  };
}

function assessmentPayload(userId, kind) {
  const qs = all('SELECT id, stem, options FROM questions WHERE assessment_pool = ? AND status = ? ORDER BY ord', kind, 'terbit');
  const a = one('SELECT * FROM assessments WHERE user_id = ? AND kind = ?', userId, kind);
  return {
    kind,
    questions: qs.map((q) => ({ id: q.id, stem: q.stem, options: JSON.parse(q.options || '[]') })),
    answers: a ? JSON.parse(a.answers) : {},
    finished: Boolean(a?.finished_at),
  };
}

function scoreAssessment(userId, kind, answers) {
  const qs = all('SELECT q.id, q.answer_key, t.slug, t.name FROM questions q JOIN topics t ON t.id = q.topic_id WHERE q.assessment_pool = ? ORDER BY q.ord', kind);
  const per = {};
  let score = 0;
  for (const q of qs) {
    per[q.slug] ||= { name: q.name, benar: 0, total: 0 };
    per[q.slug].total += 1;
    if (answers[q.id] !== undefined && answersMatch(answers[q.id], q.answer_key)) {
      per[q.slug].benar += 1;
      score += 1;
    }
  }
  return { score, total: qs.length, per };
}

function resultView(a) {
  const per = JSON.parse(a.per_topic || '{}');
  const names = Object.fromEntries(all('SELECT slug, name FROM topics').map((t) => [t.slug, t.name]));
  const rows = Object.entries(per).map(([slug, v]) => ({ slug, name: names[slug] || slug, ratio: v.benar / v.total }));
  return {
    kind: a.kind,
    strong: rows.filter((r) => r.ratio >= 0.75).map((r) => r.name),
    practice: rows.filter((r) => r.ratio < 0.75).sort((x, y) => x.ratio - y.ratio).map((r) => ({ slug: r.slug, name: r.name })),
    score: getSetting('show_numeric_score') ? { raw: a.score_raw, total: Object.values(per).reduce((s, v) => s + v.total, 0) } : null,
  };
}

function messageView(m) {
  const base = { id: m.id, role: m.role, created_at: m.created_at, client_msg_id: m.client_msg_id || undefined };
  if (m.role === 'ai' && m.status === 'dicabut') return { ...base, status: 'dicabut', text: COPY.retracted };
  return {
    ...base, text: m.content_redacted, status: m.status, hint_level: m.hint_level || undefined,
    topic: m.topic_name || undefined, feedback: m.feedback || undefined, author: m.role === 'reviewer' ? m.author_name : undefined,
    reply_to: m.role === 'reviewer' ? m.reply_to : undefined, seen: m.seen,
  };
}

function ownMessage(userId, id) {
  const m = one('SELECT m.* FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE m.id = ? AND c.user_id = ?', id, userId);
  if (!m) fail(404, 'TIDAK_DITEMUKAN', 'Pesan tidak ditemukan.');
  return m;
}

export default function register(r) {
  r.post('/api/me/onboarded', ({ user }) => {
    student({ user });
    update('users', user.id, { onboarded: 1 });
    return { ok: true };
  });

  r.put('/api/me/prefs', ({ user, body }) => {
    if (!user) fail(401, 'BELUM_MASUK', 'Sesi berakhir. Silakan masuk lagi.');
    const prefs = JSON.parse(user.prefs || '{}');
    if ('hemat' in body) prefs.hemat = Boolean(body.hemat);
    if (['sistem', 'terang', 'gelap'].includes(body.tema)) prefs.tema = body.tema;
    if (['normal', 'besar', 'sangat-besar'].includes(body.ukuran)) prefs.ukuran = body.ukuran;
    update('users', user.id, { prefs: JSON.stringify(prefs) });
    return { prefs };
  });

  r.get('/api/home', ({ user }) => {
    student({ user });
    const topics = topicsWithMastery(user.id);
    const last = one('SELECT q.topic_id FROM attempts a JOIN questions q ON q.id = a.question_id WHERE a.user_id = ? ORDER BY a.created_at DESC LIMIT 1', user.id);
    const recs = recommendations(user.id, topics);
    let cont = null;
    if (last) {
      const t = one('SELECT slug FROM topics WHERE id = ?', last.topic_id);
      cont = topics.find((x) => x.slug === t.slug);
    } else if (recs.length) {
      cont = topics.find((x) => x.slug === recs[0]);
    }
    const notes = all(
      `SELECT m.id, m.conversation_id, m.author_name, m.role, m.content_redacted, m.created_at FROM messages m JOIN conversations c ON c.id = m.conversation_id
       WHERE c.user_id = ? AND m.role IN ('reviewer','system') AND m.seen = 0 ORDER BY m.created_at DESC LIMIT 5`, user.id,
    ).map((n) => ({ id: n.id, conversation_id: n.conversation_id, author: n.author_name, preview: n.content_redacted.length > 90 ? `${n.content_redacted.slice(0, 88).trimEnd()}…` : n.content_redacted }));
    return { me: meView(user), continue: cont, notes, topics, recommended: recs };
  });

  // ---- Practice ----------------------------------------------------------------------
  r.get('/api/topics', ({ user }) => {
    student({ user });
    const topics = topicsWithMastery(user.id);
    return { topics, recommended: recommendations(user.id, topics), rule: MASTERY_RULE };
  });

  r.get('/api/practice/next', ({ user, query }) => {
    student({ user });
    const topic = one('SELECT id, slug, name FROM topics WHERE slug = ?', query.get('topic') || '');
    if (!topic) fail(404, 'TOPIK_TIDAK_ADA', 'Topik tidak ditemukan. Pilih topik dari daftar Latihan.');
    const qs = all("SELECT * FROM questions WHERE topic_id = ? AND assessment_pool = 'latihan' AND status = 'terbit' ORDER BY ord", topic.id);
    if (!qs.length) return { topic, question: null, position: 0, total: 0 };
    const solved = new Set(all('SELECT question_id FROM attempts WHERE user_id = ? AND correct = 1', user.id).map((a) => a.question_id));
    const skip = query.get('skip');
    let idx = qs.findIndex((q) => !solved.has(q.id) && q.id !== skip);
    if (idx < 0) idx = (qs.findIndex((q) => q.id === skip) + 1) % qs.length;
    const q = qs[idx];
    return { topic, question: practiceQuestion(q, user.id), position: idx + 1, total: qs.length, all_solved: qs.every((x) => solved.has(x.id)) };
  });

  r.post('/api/practice/:id/attempt', ({ user, params, body }) => {
    student({ user });
    const q = one("SELECT * FROM questions WHERE id = ? AND assessment_pool = 'latihan' AND status = 'terbit'", params.id);
    if (!q) fail(404, 'SOAL_TIDAK_ADA', 'Soal tidak ditemukan.');
    const { answer } = check(body, { answer: { type: 'string', label: 'Jawaban', max: 60, msg: 'Tulis jawabanmu dulu, ya.' } });
    const st = hs(user.id, q.id);
    const correct = answersMatch(answer, q.answer_key);
    st.tried = true;
    insert('attempts', {
      user_id: user.id, question_id: q.id, answer, correct: correct ? 1 : 0, hints_used: st.level,
      duration_s: Math.round((Date.now() - st.started) / 1000),
    });
    if (correct) hintState.delete(`${user.id}:${q.id}`);
    return {
      correct,
      feedback: correct
        ? 'Benar! Langkahmu sudah tepat.'
        : 'Belum tepat. Cek lagi hitunganmu, atau minta petunjuk.',
      can_full: true,
    };
  });

  r.post('/api/practice/:id/hint', ({ user, params }) => {
    student({ user });
    const q = one("SELECT * FROM questions WHERE id = ? AND assessment_pool = 'latihan' AND status = 'terbit'", params.id);
    if (!q) fail(404, 'SOAL_TIDAK_ADA', 'Soal tidak ditemukan.');
    const st = hs(user.id, q.id);
    st.level = Math.min(3, st.level + 1);
    return practiceQuestion(q, user.id);
  });

  // F-PRAC-2: full solution only after one attempt or two hints.
  r.post('/api/practice/:id/solution', ({ user, params }) => {
    student({ user });
    const q = one("SELECT * FROM questions WHERE id = ? AND assessment_pool = 'latihan' AND status = 'terbit'", params.id);
    if (!q) fail(404, 'SOAL_TIDAK_ADA', 'Soal tidak ditemukan.');
    const st = hs(user.id, q.id);
    if (!st.tried && st.level < 2) fail(403, 'COBA_DULU', 'Coba jawab dulu sekali, atau minta dua petunjuk, sebelum melihat langkah lengkap.');
    st.level = 4;
    const steps = all('SELECT step_no, text FROM solution_steps WHERE question_id = ? ORDER BY step_no', q.id);
    return { steps: steps.map((s) => ({ level: s.step_no, text: s.text })), answer: q.answer_key.split('|')[0] };
  });

  // ---- Assessments --------------------------------------------------------------------
  r.get('/api/assessments/:kind', ({ user, params }) => {
    student({ user });
    const { kind } = params;
    if (!['awal', 'akhir'].includes(kind)) fail(404, 'TES_TIDAK_ADA', 'Tes tidak ditemukan.');
    if (kind === 'akhir' && !getSetting('posttest_open')) fail(403, 'BELUM_DIBUKA', 'Tes Akhir belum dibuka. Gurumu akan memberi tahu waktunya.');
    return assessmentPayload(user.id, kind);
  });

  // Autosave (F-ASSESS-1): partial answers survive dropped connections.
  r.post('/api/assessments/:kind/save', ({ user, params, body }) => {
    student({ user });
    const { kind } = params;
    if (!['awal', 'akhir'].includes(kind)) fail(404, 'TES_TIDAK_ADA', 'Tes tidak ditemukan.');
    const answers = body.answers && typeof body.answers === 'object' ? body.answers : {};
    const a = one('SELECT * FROM assessments WHERE user_id = ? AND kind = ?', user.id, kind);
    if (a?.finished_at) return { ok: true, finished: true };
    if (a) update('assessments', a.id, { answers: JSON.stringify({ ...JSON.parse(a.answers), ...answers }) });
    else insert('assessments', { user_id: user.id, kind, started_at: now(), answers: JSON.stringify(answers) });
    return { ok: true };
  });

  r.post('/api/assessments/:kind/submit', ({ user, params, body }) => {
    student({ user });
    const { kind } = params;
    if (!['awal', 'akhir'].includes(kind)) fail(404, 'TES_TIDAK_ADA', 'Tes tidak ditemukan.');
    if (kind === 'akhir' && !getSetting('posttest_open')) fail(403, 'BELUM_DIBUKA', 'Tes Akhir belum dibuka.');
    let a = one('SELECT * FROM assessments WHERE user_id = ? AND kind = ?', user.id, kind);
    if (a?.finished_at) return { result: resultView(a) };
    const answers = { ...(a ? JSON.parse(a.answers) : {}), ...(body.answers || {}) };
    const { score, per } = scoreAssessment(user.id, kind, answers);
    const patch = { answers: JSON.stringify(answers), finished_at: now(), score_raw: score, per_topic: JSON.stringify(per) };
    if (a) update('assessments', a.id, patch);
    else insert('assessments', { user_id: user.id, kind, started_at: now(), ...patch });
    a = one('SELECT * FROM assessments WHERE user_id = ? AND kind = ?', user.id, kind);
    return { result: resultView(a) };
  });

  r.get('/api/assessments/:kind/result', ({ user, params }) => {
    student({ user });
    const a = one('SELECT * FROM assessments WHERE user_id = ? AND kind = ? AND finished_at IS NOT NULL', user.id, params.kind);
    if (!a) fail(404, 'BELUM_ADA_HASIL', 'Hasil tes belum ada. Selesaikan tesnya dulu.');
    return { result: resultView(a) };
  });

  // ---- Chat ---------------------------------------------------------------------------
  r.get('/api/chat/conversations', ({ user, query }) => {
    student({ user });
    const before = query.get('before') || '9999';
    const rows = all(
      `SELECT c.id, c.title, c.updated_at, t.name AS topic FROM conversations c LEFT JOIN topics t ON t.id = c.topic_id
       WHERE c.user_id = ? AND c.mode = 'bebas' AND c.updated_at < ? ORDER BY c.updated_at DESC LIMIT 15`, user.id, before,
    );
    return { conversations: rows, more: rows.length === 15 };
  });

  r.get('/api/chat/conversations/:id', ({ user, params, query }) => {
    student({ user });
    const conv = one('SELECT c.*, t.name AS topic FROM conversations c LEFT JOIN topics t ON t.id = c.topic_id WHERE c.id = ? AND c.user_id = ?', params.id, user.id);
    if (!conv) fail(404, 'TIDAK_DITEMUKAN', 'Percakapan tidak ditemukan.');
    const before = query.get('before') || '9999';
    const rows = all(
      `SELECT m.*, t.name AS topic_name FROM messages m LEFT JOIN topics t ON t.id = m.topic_id
       WHERE m.conversation_id = ? AND m.created_at < ? ORDER BY m.created_at DESC, m.rowid DESC LIMIT 20`, conv.id, before,
    ).reverse();
    run("UPDATE messages SET seen = 1 WHERE conversation_id = ? AND role IN ('reviewer','system') AND seen = 0", conv.id);
    return { conversation: { id: conv.id, title: conv.title, topic: conv.topic }, messages: rows.map(messageView), more: rows.length === 20 };
  });

  r.post('/api/chat/messages', async ({ user, body }) => {
    student({ user });
    rateLimit(`chat:${user.id}`, 6, 60_000);
    if (!consentState(user.class_id).complete) {
      fail(403, 'MENUNGGU_PERSETUJUAN', 'Kelasmu belum selesai disiapkan. Latihan sudah bisa dipakai. Tanya Bebas akan aktif setelah gurumu menyelesaikan persetujuan.');
    }
    const v = check(body, {
      text: { type: 'string', label: 'Pesan', max: 2000, msg: 'Tulis pertanyaanmu dulu, ya.' },
      client_msg_id: { type: 'string', label: 'ID pesan', max: 64, optional: true },
      conversation_id: { type: 'string', label: 'Percakapan', max: 64, optional: true },
    });
    let convId = v.conversation_id;
    if (convId && !one('SELECT id FROM conversations WHERE id = ? AND user_id = ?', convId, user.id)) convId = null;
    if (!convId) {
      // Reuse the conversation an earlier retry of this client message created.
      const prev = v.client_msg_id && one("SELECT m.conversation_id FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.user_id = ? AND m.client_msg_id = ?", user.id, v.client_msg_id);
      convId = prev?.conversation_id || insert('conversations', { user_id: user.id, mode: 'bebas', topic_id: null, title: null, hint_level: 0, attempted: 0 }).id;
    }
    const out = await handleStudentMessage({ user, conversationId: convId, text: v.text, clientMsgId: v.client_msg_id });
    const topicName = out.ai.topic_id ? one('SELECT name FROM topics WHERE id = ?', out.ai.topic_id)?.name : undefined;
    return {
      conversation_id: convId,
      student: messageView(out.student),
      ai: messageView({ ...out.ai, topic_name: topicName }),
      remaining: out.remaining,
    };
  });

  r.post('/api/messages/:id/feedback', ({ user, params, body }) => {
    student({ user });
    const { kind } = check(body, { kind: { type: 'string', oneOf: ['membantu', 'bingung', 'salah'], label: 'Umpan balik' } });
    const m = ownMessage(user.id, params.id);
    if (m.role !== 'ai') fail(400, 'BUKAN_AI', 'Umpan balik hanya untuk jawaban AI.');
    update('messages', m.id, { feedback: kind });
    if (kind === 'salah') addFlag(m.id, 'siswa_salah');
    if (kind === 'bingung') addFlag(m.id, 'siswa_bingung');
    return {
      ok: true,
      message: kind === 'membantu' ? 'Terima kasih. Senang bisa membantu.' : 'Terima kasih. Kakak peninjau akan memeriksa jawaban ini.',
    };
  });

  r.post('/api/messages/:id/ask-human', ({ user, params }) => {
    student({ user });
    const m = ownMessage(user.id, params.id);
    addFlag(m.id, 'tanya_kakak');
    return { ok: true, message: `Pesanmu sudah diteruskan ke Kakak Mahasiswa. Biasanya dibalas dalam ${getSetting('sla_hours')} jam.` };
  });

  // F-CONS-3: deletion request routed to the coordinator.
  r.post('/api/me/deletion-request', ({ user }) => {
    student({ user });
    const open = one("SELECT id FROM deletion_requests WHERE user_id = ? AND status = 'baru'", user.id);
    if (!open) {
      const d = insert('deletion_requests', { user_id: user.id, pseudonym: user.pseudonym, class_id: user.class_id, status: 'baru' });
      audit(user.id, 'minta_hapus_data', 'deletion_requests', d.id);
      insert('notifications', { audience_role: 'coordinator', school_id: user.school_id, kind: 'hapus_data', body: `Permintaan hapus data dari ${user.pseudonym}.`, link: '/dasbor/kelas', read_at: null });
    }
    return { ok: true, message: 'Permintaan sudah dikirim ke koordinator. Datamu dihapus paling lambat 7 hari kerja.' };
  });

  r.get('/api/me/remaining', ({ user }) => {
    student({ user });
    return { remaining: remainingToday(user.id) };
  });
}
