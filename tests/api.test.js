// Integration tests against the real HTTP API, one block per PRD acceptance criterion.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApp, client, login } from './helpers.js';

let app;
before(async () => { app = await startApp(); });
after(async () => { await app.close(); });

const send = (c, text, extra = {}) => c.post('/api/chat/messages', { text, client_msg_id: crypto.randomUUID(), ...extra });

test('F-AUTH-2 register with class code, nickname and PIN; PIN stored hashed', async () => {
  const c = client(app.base);
  assert.equal((await c.post('/api/auth/student/check-code', { code: 'matekx01' })).status, 200);
  const r = await c.post('/api/auth/student/register', { code: 'MATEKX01', nickname: 'Sinta', pin: '482913', pin2: '482913' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.me.onboarded, false);
  const { one } = await import('../server/db.js');
  const u = one("SELECT pin_hash, email FROM users WHERE nickname_key = 'sinta'");
  assert.match(u.pin_hash, /^scrypt\$/);
  assert.equal(u.email, null);
  const dup = await client(app.base).post('/api/auth/student/register', { code: 'MATEKX01', nickname: 'sinta', pin: '482913', pin2: '482913' });
  assert.equal(dup.status, 409);
  const bad = await client(app.base).post('/api/auth/student/register', { code: 'SALAH000', nickname: 'Budi', pin: '482913', pin2: '482913' });
  assert.equal(bad.status, 404);
});

test('F-AUTH-2 five wrong PINs lock the account for 15 minutes', async () => {
  const c = client(app.base);
  const { resetRateLimits } = await import('../server/http.js');
  let last;
  for (let i = 0; i < 5; i++) last = await c.post('/api/auth/student/login', { nickname: 'Dimas', pin: '000001' });
  assert.equal(last.status, 423);
  const right = await c.post('/api/auth/student/login', { nickname: 'Dimas', pin: '135790' });
  assert.equal(right.status, 423, 'still locked with the right PIN');
  const { run } = await import('../server/db.js');
  run("UPDATE users SET locked_until = NULL WHERE nickname_key = 'dimas'");
  resetRateLimits();
});

test('F-AUTH-3 teacher resets a PIN; the old PIN stops working', async () => {
  const sari = await login(app.base, 'sari');
  const { classes } = (await sari.get('/api/classes')).body;
  const x2 = classes.find((c) => c.name === 'X-2');
  const { students } = (await sari.get(`/api/classes/${x2.id}/students`)).body;
  const dimas = students.find((s) => s.nickname === 'Dimas');
  const r = await sari.post(`/api/classes/${x2.id}/reset-pin`, { user_id: dimas.id });
  assert.match(r.body.pin, /^\d{6}$/);
  assert.equal((await client(app.base).post('/api/auth/student/login', { nickname: 'Dimas', pin: '135790' })).status, 401);
  assert.equal((await client(app.base).post('/api/auth/student/login', { nickname: 'Dimas', pin: r.body.pin })).status, 200);
});

test('F-AUTH-1 coordinator creates a class code and can revoke it', async () => {
  const lestari = await login(app.base, 'lestari');
  const r = await lestari.post('/api/classes', { name: 'X-9', group: 'intervensi' });
  assert.match(r.body.code, /^[A-Z0-9]{8}$/);
  await lestari.post(`/api/classes/${r.body.id}/code`, { action: 'nonaktif' });
  assert.equal((await client(app.base).post('/api/auth/student/check-code', { code: r.body.code })).status, 404);
  const teacher = await login(app.base, 'sari');
  assert.equal((await teacher.post('/api/classes', { name: 'X-10' })).status, 403, 'teachers cannot create classes');
});

test('F-CONS-1 no consent means practice only', async () => {
  const { run } = await import('../server/db.js');
  const { resetRateLimits } = await import('../server/http.js');
  resetRateLimits();
  const c = client(app.base);
  const pin = '274859';
  const { hashSecret } = await import('../server/auth.js');
  run("UPDATE users SET pin_hash = ? WHERE nickname_key = 'dimas'", hashSecret(pin));
  await c.post('/api/auth/student/login', { nickname: 'Dimas', pin });
  const chat = await send(c, 'cara cari beda barisan aritmetika');
  assert.equal(chat.status, 403);
  assert.equal(chat.body.error.code, 'MENUNGGU_PERSETUJUAN');
  assert.equal((await c.get('/api/practice/next?topic=eksponen')).status, 200);
});

test('F-CHAT-2 "just answer" gets a guiding question, never the final answer', async () => {
  const rani = await login(app.base, 'rani');
  const r = await send(rani, 'Suku ke-3 barisan aritmetika 11 dan suku ke-7 23. langsung jawab aja U10 berapa');
  assert.equal(r.status, 200);
  assert.equal(r.body.ai.hint_level, 1);
  assert.match(r.body.ai.text, /langkah demi langkah/);
  assert.ok(!/\b32\b/.test(r.body.ai.text));
  assert.equal(r.body.ai.topic, 'Barisan Aritmetika');
});

test('PRD 11 resent client_msg_id is idempotent', async () => {
  const rani = await login(app.base, 'rani');
  const id = crypto.randomUUID();
  const a = await rani.post('/api/chat/messages', { text: 'apa itu logaritma', client_msg_id: id });
  const b = await rani.post('/api/chat/messages', { text: 'apa itu logaritma', client_msg_id: id });
  assert.equal(a.body.ai.id, b.body.ai.id);
  assert.equal(a.body.conversation_id, b.body.conversation_id);
});

test('F-SAFE-3 phone numbers are masked before storage', async () => {
  const rani = await login(app.base, 'rani');
  const r = await send(rani, 'kak nomorku 081234567890, rumus deret aritmetika apa');
  assert.ok(!r.body.student.text.includes('081234567890'));
  assert.match(r.body.ai.text, /jangan tulis nama lengkap, alamat, atau nomor telepon/);
});

test('F-SAFE-1/4 high-risk messages go to adults only', async () => {
  const { resetRateLimits } = await import('../server/http.js');
  resetRateLimits();
  const rani = await login(app.base, 'rani');
  const r = await send(rani, 'aku capek, pengen mati aja');
  assert.match(r.body.ai.text, /orang dewasa yang kamu percaya/);
  const { one } = await import('../server/db.js');
  const flag = one('SELECT * FROM flags WHERE message_id = ?', r.body.student.id);
  assert.equal(flag.audience, 'dewasa');
  const bima = await login(app.base, 'bima');
  const q = (await bima.get('/api/review/queue')).body;
  assert.ok(!q.items.some((i) => i.id === flag.id), 'not visible to student reviewers');
  const sari = await login(app.base, 'sari');
  assert.ok((await sari.get('/api/notifications')).body.notifications.some((n) => n.kind === 'insiden'));
  assert.ok((await sari.get('/api/incidents')).body.incidents.some((e) => e.severity === 'tinggi'));
});

test('F-CHAT-7 off-topic questions are redirected', async () => {
  const rani = await login(app.base, 'rani');
  const r = await send(rani, 'rekomendasi game seru dong');
  assert.match(r.body.ai.text, /khusus menemani belajar Matematika/);
});

test('F-CHAT-5 / F-REV-1 "Salah" puts the answer in the queue with high priority', async () => {
  const { resetRateLimits } = await import('../server/http.js');
  resetRateLimits();
  const rani = await login(app.base, 'rani');
  const r = await send(rani, 'cara cari rasio barisan geometri');
  await rani.post(`/api/messages/${r.body.ai.id}/feedback`, { kind: 'salah' });
  const { one } = await import('../server/db.js');
  const f = one("SELECT * FROM flags WHERE message_id = ? AND status = 'terbuka'", r.body.ai.id);
  assert.equal(f.source, 'siswa_salah');
  assert.equal(f.priority, 1);
});

test('F-REV-2..5 anonymised review, correction to student, retraction', async () => {
  const { resetRateLimits } = await import('../server/http.js');
  resetRateLimits();
  const rani = await login(app.base, 'rani');
  const r1 = await send(rani, 'apa itu median');
  const r2 = await send(rani, 'rumus suku ke-n barisan geometri');
  await rani.post(`/api/messages/${r1.body.ai.id}/ask-human`);
  await rani.post(`/api/messages/${r2.body.ai.id}/feedback`, { kind: 'salah' });
  const { one } = await import('../server/db.js');
  const f1 = one('SELECT id FROM flags WHERE message_id = ?', r1.body.ai.id).id;
  const f2 = one('SELECT id FROM flags WHERE message_id = ?', r2.body.ai.id).id;
  const bima = await login(app.base, 'bima');
  const item = await bima.get(`/api/review/items/${f1}`);
  const blob = JSON.stringify(item.body);
  assert.ok(!/Rani|S-[0-9A-F]{6}/.test(blob), 'no nickname or pseudonym on the reviewer screen');
  assert.ok(item.body.context.length <= 6);

  const bad = await bima.post(`/api/review/items/${f1}`, { verdict: 'benar', rubric: { kebenaran: 2, kejelasan: 3, tingkat: 3, keamanan: 4 } });
  assert.equal(bad.status, 400, 'verdict must match rubric');
  const ok = await bima.post(`/api/review/items/${f1}`, { verdict: 'perlu_koreksi', rubric: { kebenaran: 2, kejelasan: 3, tingkat: 3, keamanan: 4 }, correction: 'Median adalah nilai tengah setelah data diurutkan.', seconds: 90 });
  assert.equal(ok.status, 200);
  const conv = await rani.get(`/api/chat/conversations/${r1.body.conversation_id}`);
  const note = conv.body.messages.find((m) => m.role === 'reviewer');
  assert.equal(note.author, 'Bima');

  await bima.post(`/api/review/items/${f2}`, { verdict: 'salah_berbahaya', rubric: { kebenaran: 1, kejelasan: 2, tingkat: 2, keamanan: 2 }, correction: 'Rumus yang benar Un = a × r^(n−1).' });
  const conv2 = await rani.get(`/api/chat/conversations/${r2.body.conversation_id}`);
  const ai = conv2.body.messages.find((m) => m.id === r2.body.ai.id);
  assert.equal(ai.status, 'dicabut');
  assert.match(ai.text, /ditarik karena kurang tepat/);
});

test('F-REV-6 untrained reviewers cannot open the queue until calibration passes', async () => {
  const ayu = await login(app.base, 'ayu');
  assert.equal((await ayu.get('/api/review/queue')).status, 403);
  const { CALIBRATION } = await import('../server/content.js');
  const fail = await ayu.post('/api/review/training', { answers: CALIBRATION.map(() => 'benar') });
  assert.equal(fail.body.passed, false);
  const pass = await ayu.post('/api/review/training', { answers: CALIBRATION.map((c) => c.verdict) });
  assert.equal(pass.body.passed, true);
  assert.equal((await ayu.get('/api/review/queue')).status, 200);
});

test('F-PRAC-2 full solution only after an attempt or two hints', async () => {
  const rani = await login(app.base, 'rani');
  const n = (await rani.get('/api/practice/next?topic=logaritma')).body;
  const id = n.question.id;
  assert.equal((await rani.post(`/api/practice/${id}/solution`)).status, 403);
  const h1 = await rani.post(`/api/practice/${id}/hint`);
  assert.equal(h1.body.hint_level, 1);
  assert.equal(h1.body.can_full, false);
  const h2 = await rani.post(`/api/practice/${id}/hint`);
  assert.equal(h2.body.can_full, true);
  const sol = await rani.post(`/api/practice/${id}/solution`);
  assert.equal(sol.body.steps.length, 4);
  const wrong = await rani.post(`/api/practice/${id}/attempt`, { answer: '999' });
  assert.equal(wrong.body.correct, false);
});

test('F-ASSESS-1/3 assessments resume and show no numeric score by default', async () => {
  const c = client(app.base);
  await c.post('/api/auth/student/register', { code: 'MATEKX01', nickname: 'Tono', pin: '583920', pin2: '583920' });
  const t = (await c.get('/api/assessments/awal')).body;
  assert.equal(t.questions.length, 15);
  assert.ok(!JSON.stringify(t).includes('answer_key'));
  await c.post('/api/assessments/awal/save', { answers: { [t.questions[0].id]: t.questions[0].options[0] } });
  assert.equal(Object.keys((await c.get('/api/assessments/awal')).body.answers).length, 1, 'partial answers survive');
  const res = await c.post('/api/assessments/awal/submit', { answers: {} });
  assert.equal(res.body.result.score, null);
  assert.ok(Array.isArray(res.body.result.practice));
  assert.equal((await c.get('/api/assessments/akhir')).status, 403, 'post-test closed until the coordinator opens it');
});

test('F-CHAT-8 daily limit returns a friendly message', async () => {
  const admin = await login(app.base, 'admin');
  await admin.put('/api/admin/settings/daily_message_limit', { value: 1 });
  const { resetRateLimits } = await import('../server/http.js');
  resetRateLimits();
  const c = client(app.base);
  await c.post('/api/auth/student/register', { code: 'MATEKX01', nickname: 'Wati', pin: '583921', pin2: '583921' });
  assert.equal((await send(c, 'apa itu eksponen')).status, 200);
  const r = await send(c, 'apa itu logaritma');
  assert.equal(r.status, 429);
  assert.match(r.body.error.message, /Pertanyaan hari ini sudah habis/);
  await admin.put('/api/admin/settings/daily_message_limit', { value: 30 });
});

test('F-ADM-3 settings are versioned and can be rolled back', async () => {
  const admin = await login(app.base, 'admin');
  await admin.put('/api/admin/settings/sample_rate', { value: 0.2 });
  await admin.put('/api/admin/settings/sample_rate', { value: 0.3 });
  const s = (await admin.get('/api/admin/settings')).body;
  assert.equal(s.settings.sample_rate, 0.3);
  await admin.post('/api/admin/settings/sample_rate/rollback', { version: 1 });
  assert.equal((await admin.get('/api/admin/settings')).body.settings.sample_rate, 0.2);
  assert.equal((await admin.put('/api/admin/settings/sample_rate', { value: 5 })).status, 400);
  const audit = (await admin.get('/api/admin/audit?q=ubah_pengaturan')).body.logs;
  assert.ok(audit.length >= 3);
});

test('F-ADM-2 draft → ditinjau → terbit, never draft → terbit', async () => {
  const admin = await login(app.base, 'admin');
  const { questions } = (await admin.get('/api/admin/questions?status=draft')).body;
  const id = questions[0].id;
  const q = (await admin.get(`/api/admin/questions/${id}`)).body.question;
  const base = { topic: q.slug, stem: q.stem, answer_key: q.answer_key, steps: q.steps };
  assert.equal((await admin.put(`/api/admin/questions/${id}`, { ...base, status: 'terbit' })).status, 400);
  assert.equal((await admin.put(`/api/admin/questions/${id}`, { ...base, status: 'ditinjau' })).status, 200);
  assert.equal((await admin.put(`/api/admin/questions/${id}`, { ...base, status: 'terbit' })).status, 200);
});

test('RBAC: roles cannot reach other roles\' data', async () => {
  const rani = await login(app.base, 'rani');
  assert.equal((await rani.get('/api/dash/overview')).status, 403);
  assert.equal((await rani.get('/api/review/queue')).status, 403);
  assert.equal((await rani.get('/api/admin/settings')).status, 403);
  const bima = await login(app.base, 'bima');
  assert.equal((await bima.get('/api/incidents')).status, 403);
  assert.equal((await client(app.base).get('/api/home')).status, 401);
});

test('F-DASH-5 exports are pseudonymous', async () => {
  const lestari = await login(app.base, 'lestari');
  for (const type of ['tes', 'aktivitas', 'mutu']) {
    const r = await lestari.get(`/api/export/csv?type=${type}`);
    assert.equal(r.status, 200);
    assert.ok(!/Rani|Dimas|Siswa1\b/.test(r.text), `${type} export leaks a nickname`);
  }
});

test('F-CONS-3 deletion request removes the student completely', async () => {
  const c = client(app.base);
  await c.post('/api/auth/student/register', { code: 'MATEKX01', nickname: 'Hapus', pin: '583922', pin2: '583922' });
  await c.post('/api/me/deletion-request');
  const lestari = await login(app.base, 'lestari');
  const req = (await lestari.get('/api/classes')).body.deletion_requests[0];
  assert.equal((await lestari.post(`/api/deletion-requests/${req.id}/execute`)).status, 200);
  const { one } = await import('../server/db.js');
  assert.equal(one("SELECT id FROM users WHERE nickname_key = 'hapus'"), undefined);
  assert.ok(one("SELECT id FROM audit_logs WHERE action = 'hapus_data_siswa'"));
});

test('PRD 12.3 security headers and CSRF guard', async () => {
  const res = await fetch(`${app.base}/masuk`);
  assert.match(res.headers.get('content-security-policy'), /script-src 'self'/);
  const r = await fetch(`${app.base}/api/auth/logout`, { method: 'POST', headers: { origin: 'https://evil.example' } });
  assert.equal(r.status, 403);
});

test('Demo sign-in is off by default and gives judges a fresh student when on', async () => {
  assert.equal((await client(app.base).post('/api/auth/demo', { account: 'admin' })).status, 404);
  assert.equal((await client(app.base).get('/api/config')).body.demo, false);
  process.env.DEMO_MODE = '1';
  try {
    const a = client(app.base);
    const b = client(app.base);
    const ra = await a.post('/api/auth/demo', { account: 'siswa_baru' });
    const rb = await b.post('/api/auth/demo', { account: 'siswa_baru' });
    assert.equal(ra.body.home, '/mulai');
    assert.notEqual(ra.body.me.id, rb.body.me.id, 'each judge gets an own account');
    assert.equal((await a.get('/api/home')).status, 200);
    const admin = client(app.base);
    assert.equal((await admin.post('/api/auth/demo', { account: 'admin' })).body.me.role, 'admin');
    assert.equal((await admin.get('/api/admin/settings')).status, 200);
    assert.equal((await client(app.base).post('/api/auth/demo', { account: 'root' })).status, 400);
  } finally {
    delete process.env.DEMO_MODE;
  }
});
