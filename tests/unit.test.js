// Unit tests for pure logic, each tied to a PRD requirement.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import './helpers.js';
import { evaluate, verifyClaims, answersMatch } from '../server/ai/mathcheck.js';
import { redactPII, checkInput, classifyIntent, checkOutput, looksLikeAttempt } from '../server/ai/safety.js';
import { nextHintLevel, buildHistory } from '../server/ai/pipeline.js';
import { verdictAllowed, suggestVerdict } from '../server/routes/review.js';
import { masteryLevel } from '../server/routes/student.js';
import { validateQuestion } from '../server/routes/admin.js';
import { DEFAULTS } from '../server/settings.js';
import { TOPICS, PRACTICE, ASSESS } from '../server/content.js';
import { newJoinCode } from '../server/auth.js';

test('F-CHAT-6 arithmetic evaluator handles school notation', () => {
  assert.equal(evaluate('2^3 × 2^4'), 128);
  assert.equal(evaluate('(6 + 7) : 2'), 6.5);
  assert.equal(evaluate('−(−6)/(2 × 1)'), 3);
  assert.equal(evaluate('10 × 1/2'), 5);
  assert.equal(evaluate('2x + 1'), null); // algebra is not arithmetic
});

test('F-CHAT-6 claim verifier flags wrong arithmetic and ignores algebra', () => {
  assert.equal(verifyClaims('Jadi 23 − 11 = 12, lalu 12 : 4 = 3.').ok, true);
  const bad = verifyClaims('Hitung 3 × 4 = 13.');
  assert.equal(bad.ok, false);
  assert.equal(bad.mismatches[0].expected, 12);
  assert.equal(verifyClaims('x + 1 = 5, jadi x = 4').checked, 0);
  assert.equal(verifyClaims('S10 = 10/2 × (2 × 3 + 9 × 4) = 5 × (6 + 36)').ok, true);
});

test('curated content is arithmetically consistent', () => {
  for (const t of TOPICS) for (const text of Object.values(t.chunks)) assert.equal(verifyClaims(text).ok, true, text);
  for (const p of PRACTICE) {
    for (const s of p.steps) assert.equal(verifyClaims(s).ok, true, s);
    assert.equal(p.steps.length, 4, p.stem);
  }
  assert.equal(PRACTICE.length, 30);
  assert.equal(ASSESS.awal.length, 15);
  assert.equal(ASSESS.akhir.length, 15);
  for (const kind of ['awal', 'akhir']) for (const q of ASSESS[kind]) assert.ok(q.options.includes(q.key), q.stem);
});

test('F-ASSESS-2 pre- and post-test cover the same topics', () => {
  const topics = (k) => ASSESS[k].map((q) => q.topic).sort().join();
  assert.equal(topics('awal'), topics('akhir'));
});

test('answer matching accepts equivalent forms', () => {
  assert.ok(answersMatch('0,6', '0.6|3/5'));
  assert.ok(answersMatch('3/5', '0.6|3/5'));
  assert.ok(answersMatch(' -3 ', '-3'));
  assert.ok(answersMatch('x = 4', '4|x=4'));
  assert.ok(answersMatch('3.000', '3000|3.000|rp3000'));
  assert.ok(!answersMatch('3', '4'));
});

test('F-SAFE-3 personal data is redacted', () => {
  const r = redactPII('nomorku 0812-3456-7890, email rani@mail.com, rumah di Jl. Merdeka No. 5, RT 02/RW 03');
  assert.ok(!/0812|rani@|Merdeka|RT 02/.test(r.text), r.text);
  assert.deepEqual(r.found.sort(), ['alamat', 'email', 'telepon']);
});

test('F-SAFE-1 input filter separates high and medium risk', () => {
  assert.equal(checkInput('aku pengen mati aja', DEFAULTS.safety_patterns).severity, 'tinggi');
  assert.equal(checkInput('aku dibully di kelas', DEFAULTS.safety_patterns).severity, 'sedang');
  assert.equal(checkInput('cara cari beda barisan', DEFAULTS.safety_patterns).severity, null);
});

test('intent routing (9.1 step 3)', () => {
  assert.equal(classifyIntent('langsung jawab aja kak', DEFAULTS.refused_topics), 'minta_jawaban');
  assert.equal(classifyIntent('tunjukkan langkah lengkap', DEFAULTS.refused_topics), 'langkah_lengkap');
  assert.equal(classifyIntent('main game apa yang seru', DEFAULTS.refused_topics), 'di_luar_belajar');
  assert.equal(classifyIntent('masih bingung', DEFAULTS.refused_topics), 'minta_petunjuk');
  assert.ok(looksLikeAttempt('23 - 11 = 4 x beda?'));
  assert.ok(looksLikeAttempt('4'));
  assert.ok(!looksLikeAttempt('suku ke-3 adalah 11'));
});

test('F-CHAT-2 hint ladder: L4 only after an attempt', () => {
  const s = { current: 1, attempted: false, isNewQuestion: false, isAttempt: false };
  assert.equal(nextHintLevel({ ...s, current: 0, intent: 'minta_jawaban' }).level, 1);
  assert.equal(nextHintLevel({ ...s, intent: 'minta_jawaban' }).level, 1, 'begging does not climb');
  assert.equal(nextHintLevel({ ...s, current: 3, intent: 'minta_petunjuk' }).level, 3, 'capped at L3 without an attempt');
  assert.equal(nextHintLevel({ ...s, current: 2, intent: 'langkah_lengkap' }).level, 3);
  assert.equal(nextHintLevel({ ...s, current: 2, intent: 'langkah_lengkap', isAttempt: true }).level, 4);
  assert.equal(nextHintLevel({ ...s, current: 3, attempted: true, intent: 'minta_petunjuk' }).level, 4);
  assert.equal(nextHintLevel({ ...s, current: 3, attempted: true, intent: 'belajar', isNewQuestion: true }).level, 1);
});

test('F-CHAT-2 output filter catches a final answer before L4', () => {
  assert.ok(checkOutput('Jadi jawabannya adalah 32.', { hintLevel: 2 }).includes('bocor_jawaban'));
  assert.equal(checkOutput('Jadi jawabannya adalah 32.', { hintLevel: 4 }).length, 0);
  assert.ok(checkOutput('', { hintLevel: 1 }).includes('kosong'));
});

test('history sent to the model alternates and starts with the student', () => {
  const h = buildHistory([
    { role: 'ai', content_redacted: 'halo', status: 'terkirim' },
    { role: 'student', content_redacted: 'a', status: 'terkirim' },
    { role: 'ai', content_redacted: 'b', status: 'dicabut' },
    { role: 'reviewer', content_redacted: 'c', status: 'terkirim' },
  ], 'd');
  assert.deepEqual(h.map((m) => m.role), ['user', 'assistant', 'user']);
  assert.ok(h[1].content.includes('[Catatan peninjau manusia] c'));
  assert.ok(!JSON.stringify(h).includes('"b"'), 'retracted answers are not replayed');
  assert.ok(h[2].content.includes('<pesan_siswa>'));
});

test('Appendix B verdicts follow the rubric', () => {
  assert.ok(verdictAllowed('benar', { kebenaran: 4, kejelasan: 3, tingkat: 3, keamanan: 4 }));
  assert.ok(!verdictAllowed('benar', { kebenaran: 4, kejelasan: 2, tingkat: 3, keamanan: 4 }));
  assert.ok(verdictAllowed('salah_berbahaya', { kebenaran: 1, kejelasan: 3, tingkat: 3, keamanan: 3 }));
  assert.ok(!verdictAllowed('salah_berbahaya', { kebenaran: 2, kejelasan: 3, tingkat: 3, keamanan: 3 }));
  assert.equal(suggestVerdict({ kebenaran: 2, kejelasan: 3, tingkat: 3, keamanan: 4 }), 'perlu_koreksi');
});

test('F-PRAC-3 mastery levels are rule based', () => {
  const a = (xs) => xs.map((c) => ({ correct: c }));
  assert.equal(masteryLevel([]), 'belum');
  assert.equal(masteryLevel(a([0, 1])), 'mulai');
  assert.equal(masteryLevel(a([1, 1, 1, 0, 0])), 'cukup');
  assert.equal(masteryLevel(a([1, 1, 1, 1, 0, 1])), 'kuat');
});

test('F-ADM-2 publishing requires complete items', () => {
  assert.ok(validateQuestion({ stem: 'pendek', answer_key: '', assessment_pool: 'latihan', type: 'isian' }, []).length >= 2);
  assert.equal(validateQuestion({ stem: 'Hitung 2 + 2 dengan benar.', answer_key: '4', assessment_pool: 'latihan', type: 'isian' }, ['a', 'b', 'c', 'd']).length, 0);
});

test('F-AUTH-1 join codes are 8 chars without look-alike characters', () => {
  for (let i = 0; i < 200; i++) assert.match(newJoinCode(), /^[A-HJKMNP-Z2-9]{8}$/);
});

test('PRD 11 rate limits key on the real client behind a proxy', async () => {
  const { clientIp } = await import('../server/http.js');
  const req = { headers: { 'x-forwarded-for': '6.6.6.6, 203.0.113.7' }, socket: { remoteAddress: '10.0.0.1' } };
  assert.equal(clientIp(req), '10.0.0.1', 'headers ignored unless TRUST_PROXY=1');
  process.env.TRUST_PROXY = '1';
  try {
    assert.equal(clientIp(req), '203.0.113.7', 'last hop is the one the proxy added');
    assert.equal(clientIp({ headers: {}, socket: { remoteAddress: '10.0.0.1' } }), '10.0.0.1');
  } finally {
    delete process.env.TRUST_PROXY;
  }
});
