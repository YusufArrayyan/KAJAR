// One student message through PRD 9.1 steps [1]..[10].
import { one, all, insert, update, run, now, tx } from '../db.js';
import { fail } from '../http.js';
import { getAllSettings, activePrompt } from '../settings.js';
import { addFlag, maybeSample, notify } from '../queue.js';
import { redactPII, normalize, checkInput, classifyIntent, looksLikeAttempt, checkOutput, trimWords } from './safety.js';
import { retrieve, chunksForTopic } from './retrieve.js';
import { verifyClaims } from './mathcheck.js';
import { getProvider, getFallbackProvider } from './provider.js';

export const COPY = {
  aiLabel: 'Jawaban AI. Bisa salah, cek lagi kalau ragu.',
  refuseDirect: 'Aku bantu langkah demi langkah dulu, ya. Coba tulis dulu bagian yang sudah kamu tahu.',
  outOfScope: 'Pertanyaan ini di luar materi yang kupelajari. Coba tanyakan ke gurumu, atau kirim lewat Tanya Kakak Mahasiswa.',
  unsure: 'Aku kurang yakin dengan jawaban ini. Pesanmu kuteruskan ke Kakak peninjau.',
  pii: 'Sebaiknya jangan tulis nama lengkap, alamat, atau nomor telepon di sini.',
  heavy: 'Kedengarannya ini berat buat kamu. Aku bukan tempat yang tepat untuk ini. Ceritakan ke gurumu atau orang dewasa yang kamu percaya.',
  offTopic: 'Aku khusus menemani belajar Matematika. Yuk kembali ke pelajaran: soal apa yang sedang kamu kerjakan?',
  dailyLimit: 'Pertanyaan hari ini sudah habis. Besok lanjut ya. Sementara itu coba Latihan.',
  resting: 'Tutor sedang istirahat. Latihan tetap bisa dipakai, dan pesanmu tidak hilang.',
  retracted: 'Jawaban ini ditarik karena kurang tepat. Kakak peninjau sedang menyiapkan penjelasan yang benar.',
};

const today = () => now().slice(0, 10);

// Step [5] — pure so it can be unit-tested against PRD 9.2.
export function nextHintLevel({ current, attempted, intent, isNewQuestion, isAttempt }) {
  if (isNewQuestion || current === 0) {
    return { level: 1, attempted: false };
  }
  const tried = attempted || isAttempt;
  const cap = tried ? 4 : 3;
  let level = current;
  if (intent === 'langkah_lengkap') level = tried ? 4 : current + 1;
  else if (intent === 'minta_petunjuk') level = current + 1;
  else if (intent === 'minta_jawaban') level = tried && current >= 3 ? 4 : current;
  else if (isAttempt) level = current + 1;
  return { level: Math.max(1, Math.min(cap, level)), attempted: tried };
}

export function fillPrompt(body, { hintLevel, chunks }) {
  const material = chunks.length
    ? chunks.map((c, i) => `<materi no="${i + 1}" jenis="${c.kind}">\n${c.text}\n</materi>`).join('\n')
    : '(tidak ada materi yang cocok)';
  return body.replace('{hint_level}', `L${hintLevel}`).replace('{retrieved_chunks}', material);
}

// Build an alternating user/assistant history that starts with the user (API requirement).
export function buildHistory(rows, currentText) {
  const msgs = [];
  for (const r of rows) {
    if (r.status === 'dicabut' || r.role === 'system') continue;
    const role = r.role === 'student' ? 'user' : 'assistant';
    const text = r.role === 'reviewer' ? `[Catatan peninjau manusia] ${r.content_redacted}` : r.content_redacted;
    const last = msgs[msgs.length - 1];
    if (last && last.role === role) last.content += `\n\n${text}`;
    else msgs.push({ role, content: text });
  }
  while (msgs.length && msgs[0].role !== 'user') msgs.shift();
  const wrapped = `<pesan_siswa>\n${currentText}\n</pesan_siswa>`;
  const last = msgs[msgs.length - 1];
  if (last && last.role === 'user') last.content += `\n\n${wrapped}`;
  else msgs.push({ role: 'user', content: wrapped });
  return msgs;
}

function usageToday(userId) {
  return one('SELECT messages_count, tokens FROM usage_daily WHERE user_id = ? AND date = ?', userId, today()) || { messages_count: 0, tokens: 0 };
}

export function remainingToday(userId, settings = getAllSettings()) {
  return Math.max(0, settings.daily_message_limit - usageToday(userId).messages_count);
}

function bumpUsage(userId, tokens, bytes = 0) {
  run(
    `INSERT INTO usage_daily (user_id, date, messages_count, tokens, bytes) VALUES (?, ?, 1, ?, ?)
     ON CONFLICT(user_id, date) DO UPDATE SET messages_count = messages_count + 1, tokens = tokens + excluded.tokens, bytes = bytes + excluded.bytes`,
    userId, today(), tokens, bytes,
  );
}

export function budgetExhausted(settings = getAllSettings()) {
  const used = one('SELECT COALESCE(SUM(tokens),0) AS t FROM usage_daily WHERE date = ?', today()).t;
  return used >= settings.daily_budget_tokens;
}

function saveAi(conversationId, replyTo, fields) {
  return insert('messages', {
    conversation_id: conversationId, role: 'ai', reply_to: replyTo, client_msg_id: null, status: 'terkirim', seen: 0, ...fields,
  });
}

async function callModel(args) {
  const primary = getProvider();
  const started = Date.now();
  try {
    const r = await primary.generate(args);
    if (r.refused) return { ...r, latency_ms: Date.now() - started, provider: primary.name };
    if (!r.out) throw new Error('keluaran_tidak_valid');
    return { ...r, latency_ms: Date.now() - started, provider: primary.name };
  } catch (err) {
    const fb = getFallbackProvider();
    if (fb === primary) throw err;
    console.warn(JSON.stringify({ level: 'warn', event: 'llm_fallback', reason: err.message }));
    const r = await fb.generate(args);
    return { ...r, latency_ms: Date.now() - started, provider: fb.name };
  }
}

export async function handleStudentMessage({ user, conversationId, text, clientMsgId }) {
  const settings = getAllSettings();
  const conv = one('SELECT * FROM conversations WHERE id = ? AND user_id = ?', conversationId, user.id);
  if (!conv) fail(404, 'TIDAK_DITEMUKAN', 'Percakapan tidak ditemukan. Mulai percakapan baru.');

  // Idempotency (PRD 11): a resent client_msg_id returns the stored pair.
  let student = clientMsgId
    ? one('SELECT * FROM messages WHERE conversation_id = ? AND client_msg_id = ?', conv.id, clientMsgId)
    : null;
  if (student) {
    const ai = one("SELECT * FROM messages WHERE reply_to = ? AND role = 'ai'", student.id);
    if (ai) return { student, ai, duplicate: true, remaining: remainingToday(user.id, settings) };
  }

  const clean = normalize(text);
  if (!clean) fail(400, 'PESAN_KOSONG', 'Tulis pertanyaanmu dulu, ya.');
  if (clean.length > settings.max_input_chars) {
    fail(400, 'TERLALU_PANJANG', `Pesan maksimal ${settings.max_input_chars} karakter. Coba pecah jadi dua pesan.`);
  }
  if (!student && usageToday(user.id).messages_count >= settings.daily_message_limit) {
    fail(429, 'BATAS_HARIAN', COPY.dailyLimit);
  }
  if (budgetExhausted(settings)) fail(503, 'ISTIRAHAT', COPY.resting);

  // [1] normalise + redact before anything is stored.
  const { text: redacted, found: pii } = redactPII(clean);
  if (!student) {
    student = insert('messages', {
      conversation_id: conv.id, client_msg_id: clientMsgId || null, role: 'student', content_redacted: redacted,
      status: 'terkirim', seen: 1,
    });
  }
  if (!conv.title) update('conversations', conv.id, { title: redacted.slice(0, 60) });

  const prefix = pii.length ? `${COPY.pii}\n\n` : '';

  // [2] input safety.
  const safety = checkInput(clean, settings.safety_patterns);
  if (safety.severity) {
    const ai = saveAi(conv.id, student.id, {
      content_redacted: `${COPY.heavy}\n\n${settings.help_text}`, status: 'lolos keamanan', hint_level: null, confidence: null,
      model_id: 'aturan-keamanan', prompt_version: null,
    });
    update('messages', ai.id, { status: 'terkirim' });
    const ev = insert('safety_events', {
      message_id: student.id, class_id: user.class_id, category: safety.category, severity: safety.severity,
      status: 'baru', note: null, handled_by: null,
    });
    if (safety.severity === 'tinggi') {
      // [2] high risk: adults only, immediate notification, kept out of the student-reviewer queue (F-SAFE-4).
      addFlag(student.id, 'keamanan', { audience: 'dewasa' });
      const schoolId = one('SELECT school_id FROM classes WHERE id = ?', user.class_id)?.school_id;
      for (const role of settings.incident_recipients) {
        notify(role, 'insiden', 'Kejadian keselamatan risiko tinggi perlu ditindaklanjuti hari ini.', { schoolId, link: `/dasbor/insiden#${ev.id}` });
      }
    } else {
      addFlag(student.id, 'keamanan');
    }
    bumpUsage(user.id, 0);
    return { student, ai: { ...ai, status: 'terkirim' }, remaining: remainingToday(user.id, settings) };
  }

  // [3] intent.
  const intent = classifyIntent(clean, settings.refused_topics);
  if (intent === 'di_luar_belajar') {
    const ai = saveAi(conv.id, student.id, { content_redacted: prefix + COPY.offTopic, model_id: 'aturan-topik', hint_level: null });
    bumpUsage(user.id, 0);
    return { student, ai, remaining: remainingToday(user.id, settings) };
  }

  // [4] retrieval, anchored on the current topic for short follow-ups.
  const found = retrieve(clean, { topicHint: conv.topic_id });
  let topic = found.topic;
  if (!topic && conv.topic_id) {
    const t = one('SELECT id, name, slug FROM topics WHERE id = ?', conv.topic_id);
    topic = t;
  }
  const isNewQuestion = conv.hint_level === 0 || Boolean(found.topic && conv.topic_id && found.topic.id !== conv.topic_id && found.score >= 0.4);
  const isAttempt = looksLikeAttempt(clean);

  if (!topic) {
    const ai = saveAi(conv.id, student.id, { content_redacted: prefix + COPY.outOfScope, confidence: 0, model_id: 'aturan-materi', hint_level: null });
    addFlag(ai.id, 'kepercayaan');
    bumpUsage(user.id, 0);
    return { student, ai, remaining: remainingToday(user.id, settings) };
  }

  // [5] hint level.
  const ladder = nextHintLevel({ current: conv.hint_level, attempted: Boolean(conv.attempted), intent, isNewQuestion, isAttempt });
  const chunks = found.topic ? found.chunks : [];
  const allTopicChunks = chunksForTopic(topic.id);

  // [6] generation.
  const prompt = activePrompt();
  const historyRows = all(
    'SELECT role, content_redacted, status FROM messages WHERE conversation_id = ? AND id != ? ORDER BY created_at DESC LIMIT 6',
    conv.id, student.id,
  ).reverse();
  const args = {
    system: fillPrompt(prompt.body, { hintLevel: ladder.level, chunks: chunks.length ? chunks : allTopicChunks.slice(0, 4) }),
    history: buildHistory(historyRows, redacted),
    maxTokens: settings.max_output_tokens,
    context: { hintLevel: ladder.level, topic, chunks: allTopicChunks, intent, studentText: redacted, retrievalScore: found.topic ? found.score : 0.75 },
  };
  let result;
  try {
    result = await callModel(args);
  } catch (err) {
    console.error(JSON.stringify({ level: 'error', event: 'llm_gagal', reason: err.message }));
    fail(503, 'ISTIRAHAT', COPY.resting);
  }

  const flags = [];
  let reply;
  let confidence;
  let toolCheck = null;
  let usedLevel = ladder.level;
  if (result.refused || !result.out || !result.out.reply) {
    reply = COPY.unsure;
    confidence = 0;
    flags.push('kepercayaan');
  } else {
    reply = result.out.reply;
    confidence = result.out.confidence;
    usedLevel = Math.min(ladder.level, result.out.hint_level_used || ladder.level);

    // [7] deterministic arithmetic check; one regeneration for real models, then flag.
    let check = verifyClaims(reply);
    if (!check.ok && result.provider !== 'mock') {
      try {
        const retry = await callModel({
          ...args,
          history: [...args.history, { role: 'assistant', content: JSON.stringify(result.out) },
            { role: 'user', content: `<catatan_sistem>Ada hitungan yang tidak cocok: ${check.mismatches.map((m) => `${m.claim} (seharusnya ${m.expected})`).join('; ')}. Perbaiki dan kirim ulang JSON.</catatan_sistem>` }],
        });
        if (retry.out?.reply) {
          const check2 = verifyClaims(retry.out.reply);
          if (check2.ok) {
            reply = retry.out.reply;
            confidence = retry.out.confidence;
            check = check2;
          }
        }
      } catch { /* keep the first answer and flag it */ }
    }
    if (check.checked) toolCheck = JSON.stringify(check);
    if (!check.ok) flags.push('alat');

    // [8] self-assessed confidence.
    if (confidence < settings.confidence_threshold) {
      flags.push('kepercayaan');
      reply = `${reply}\n\n${COPY.unsure}`;
    }
  }

  // [9] output filter.
  const violations = checkOutput(reply, { hintLevel: usedLevel, banned: settings.output_banned });
  if (violations.includes('bocor_jawaban') || violations.includes('kata_terlarang') || violations.includes('kosong')) {
    reply = `${COPY.refuseDirect} ${allTopicChunks.find((c) => c.kind === 'penuntun')?.text || ''}`.trim();
    flags.push('kepercayaan');
  }
  reply = trimWords(reply, 150);
  if (intent === 'minta_jawaban' && usedLevel < 4 && !reply.startsWith(COPY.refuseDirect.slice(0, 20))) {
    reply = `${COPY.refuseDirect}\n\n${reply}`;
  }
  reply = prefix + reply;

  const prov = getProvider();
  const ai = tx(() => {
    const m = saveAi(conv.id, student.id, {
      content_redacted: reply, topic_id: topic.id, hint_level: usedLevel, confidence, tool_check: toolCheck,
      model_id: result.model_id || prov.model, prompt_version: prompt ? `${prompt.name}@${prompt.version}` : null,
      latency_ms: result.latency_ms, tokens_in: result.tokens_in || 0, tokens_out: result.tokens_out || 0,
    });
    update('conversations', conv.id, { hint_level: usedLevel, attempted: ladder.attempted ? 1 : 0, topic_id: topic.id });
    // [10] queue routing.
    for (const f of flags) addFlag(m.id, f);
    if (!flags.length) maybeSample(m.id);
    bumpUsage(user.id, (result.tokens_in || 0) + (result.tokens_out || 0));
    return m;
  });
  return { student, ai, topic, remaining: remainingToday(user.id, settings) };
}
