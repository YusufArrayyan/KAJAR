// Demo seed. Run: npm run seed  (wipes data/kajar.db and recreates it)
// Pilot without synthetic activity: node server/seed.js --reset --tanpa-demo
// Demo accounts (test values only; never reuse outside a local demo):
//   Siswa  : nama panggilan "Rani" PIN 246810 (kelas X-1, persetujuan lengkap)
//            nama panggilan "Dimas" PIN 135790 (kelas X-2, persetujuan belum lengkap)
//   Kode kelas: X-1 = MATEKX01, X-2 = MATEKX02
//   Staf (kata sandi semua: kajar-demo-2026):
//            peninjau bima@kajar.test, guru sari@kajar.test, koordinator lestari@kajar.test, admin admin@kajar.test
import { rmSync, existsSync } from 'node:fs';
import { openDb, insert, run, one, now } from './db.js';
import { hashSecret, hashJoinCode, nicknameKey, newPseudonym } from './auth.js';
import { TOPICS, PRACTICE, ASSESS, PROMPT_V1, LICENSE } from './content.js';
import { answersMatch } from './ai/mathcheck.js';

export const DEMO = {
  staffPassword: 'kajar-demo-2026',
  codes: { 'X-1': 'MATEKX01', 'X-2': 'MATEKX02' },
};

// Deterministic pseudo-random generator so demo dashboards look the same on every seed.
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

const daysAgo = (d, h = 10) => {
  const t = new Date();
  t.setDate(t.getDate() - d);
  t.setHours(h, (d * 7) % 60, 0, 0);
  return t.toISOString();
};

export function seed({ demoActivity = true } = {}) {
  const db = openDb();
  const t0 = now();

  // Content ---------------------------------------------------------------
  const subject = insert('subjects', { name: 'Matematika' });
  const topicIds = {};
  TOPICS.forEach((t, i) => {
    const row = insert('topics', { subject_id: subject.id, slug: t.slug, name: t.name, phase: 'E', ord: i + 1, keywords: t.keywords });
    topicIds[t.slug] = row.id;
    for (const [kind, text] of Object.entries(t.chunks)) {
      insert('content_chunks', { topic_id: row.id, kind, text, source_ref: `kajar:${t.slug}:${kind}`, license_note: LICENSE, status: 'terbit' });
    }
  });
  PRACTICE.forEach((p, i) => {
    // Demo items are published so the app is usable; docs/OPEN_ITEMS.md requires teacher review before a pilot.
    const q = insert('questions', {
      topic_id: topicIds[p.topic], stem: p.stem, type: 'isian', options: null, answer_key: p.key, difficulty: 2,
      status: 'terbit', assessment_pool: 'latihan', ord: i,
    });
    p.steps.forEach((text, j) => insert('solution_steps', { question_id: q.id, step_no: j + 1, text, hint_level: j + 1 }));
  });
  for (const [kind, items] of Object.entries(ASSESS)) {
    items.forEach((a, i) => insert('questions', {
      topic_id: topicIds[a.topic], stem: a.stem, type: 'pg', options: JSON.stringify(a.options), answer_key: a.key,
      difficulty: 2, status: 'terbit', assessment_pool: kind, ord: i,
    }));
  }

  // One draft item so the admin "draf → ditinjau → terbit" flow has something to act on.
  const draft = insert('questions', {
    topic_id: topicIds['statistika'], stem: 'Tentukan modus data 3, 5, 5, 7, 8, 5, 7.', type: 'isian', options: null,
    answer_key: '5', difficulty: 1, status: 'draft', assessment_pool: 'latihan', ord: 99,
  });
  ['Modus adalah nilai yang paling sering muncul. Nilai mana yang muncul paling banyak?',
    'Hitung berapa kali setiap nilai muncul.',
    '3 muncul 1 kali, 5 muncul 3 kali, 7 muncul 2 kali, 8 muncul 1 kali. Mana yang terbanyak?',
    'Nilai 5 muncul 3 kali, paling sering. Modusnya 5.'].forEach((text, j) =>
    insert('solution_steps', { question_id: draft.id, step_no: j + 1, text, hint_level: j + 1 }));

  insert('prompt_versions', { name: 'tutor', version: 1, body: PROMPT_V1, active: 1, created_by: null });

  // Organisation ----------------------------------------------------------
  const school = insert('schools', {
    name: 'SMA Contoh Bengkulu (data demo)', region: 'Bengkulu', connectivity_note: 'Belum diukur. Lakukan survei sinyal dan kuota sebelum pilot.',
    consent_status: 'tercatat', consent_doc_ref: null,
  });
  const x1 = insert('classes', { school_id: school.id, name: 'X-1', grade: 'X', join_code_hash: hashJoinCode(DEMO.codes['X-1']), join_code_active: 1, comparison_group: 'intervensi' });
  const x2 = insert('classes', { school_id: school.id, name: 'X-2', grade: 'X', join_code_hash: hashJoinCode(DEMO.codes['X-2']), join_code_active: 1, comparison_group: 'pembanding' });

  const staffHash = hashSecret(DEMO.staffPassword);
  const staff = {};
  for (const [role, email, name] of [
    ['reviewer', 'bima@kajar.test', 'Bima'], ['reviewer', 'ayu@kajar.test', 'Ayu'],
    ['teacher', 'sari@kajar.test', 'Bu Sari'], ['coordinator', 'lestari@kajar.test', 'Dr. Lestari'], ['admin', 'admin@kajar.test', 'Admin Pilot'],
  ]) {
    staff[email] = insert('users', { role, email, display_name: name, password_hash: staffHash, school_id: school.id, status: 'aktif', onboarded: 1, prefs: '{}' });
  }
  const coord = staff['lestari@kajar.test'];
  insert('consents', { class_id: x1.id, type: 'sekolah', recorded_by: coord.id, recorded_at: daysAgo(30), note: 'Surat izin kepala sekolah (contoh).' });
  insert('consents', { class_id: x1.id, type: 'wali', recorded_by: coord.id, recorded_at: daysAgo(28), note: 'Formulir persetujuan wali terkumpul (contoh).' });
  insert('consents', { class_id: x2.id, type: 'sekolah', recorded_by: coord.id, recorded_at: daysAgo(30), note: null });
  // Reviewer Bima passed training; Ayu has not, so her queue stays locked.
  insert('reviewer_training', { user_id: staff['bima@kajar.test'].id, score: 90, passed_at: daysAgo(25) });

  const student = (nick, pin, classId, onboarded = 1) => insert('users', {
    role: 'student', display_name: nick, nickname_key: nicknameKey(nick), pin_hash: hashSecret(pin), class_id: classId,
    school_id: school.id, pseudonym: newPseudonym(), status: 'aktif', onboarded, prefs: '{}',
  });
  const rani = student('Rani', '246810', x1.id);
  student('Dimas', '135790', x2.id);

  if (demoActivity) seedActivity({ topicIds, x1, x2, school, staff, rani });
  return { school, x1, x2, rani, staff, startedAt: t0 };
}

// Synthetic activity for dashboards and the reviewer queue. Clearly fake: pseudonyms only, "data demo" school.
function seedActivity({ topicIds, x1, x2, staff, rani }) {
  const rand = rng(2026);
  const slugs = Object.keys(topicIds);
  const pinHash = hashSecret('000000');
  const students = [rani];
  for (let i = 0; i < 22; i++) {
    const cls = i < 12 ? x1 : x2;
    students.push(insert('users', {
      role: 'student', display_name: `Siswa${i + 1}`, nickname_key: `siswa${i + 1}`, pin_hash: pinHash, class_id: cls.id,
      school_id: cls.school_id, pseudonym: newPseudonym(), status: 'aktif', onboarded: 1, prefs: '{}',
    }));
  }
  const assessQs = (kind) => db().prepare('SELECT id, topic_id, answer_key, options FROM questions WHERE assessment_pool = ? ORDER BY ord').all(kind);
  const awalQs = assessQs('awal');
  const akhirQs = assessQs('akhir');
  const topicName = Object.fromEntries(db().prepare('SELECT id, slug FROM topics').all().map((t) => [t.id, t.slug]));

  const takeTest = (u, kind, qs, skill, day) => {
    const answers = {};
    const per = {};
    let score = 0;
    for (const q of qs) {
      const opts = JSON.parse(q.options);
      const ok = rand() < skill;
      const ans = ok ? q.answer_key : opts.find((o) => o !== q.answer_key);
      answers[q.id] = ans;
      const slug = topicName[q.topic_id];
      per[slug] ||= { benar: 0, total: 0 };
      per[slug].total += 1;
      if (answersMatch(ans, q.answer_key)) {
        per[slug].benar += 1;
        score += 1;
      }
    }
    insert('assessments', {
      user_id: u.id, kind, started_at: daysAgo(day, 9), finished_at: daysAgo(day, 10), answers: JSON.stringify(answers),
      score_raw: score, per_topic: JSON.stringify(per),
    });
  };

  students.forEach((u, i) => {
    const base = 0.35 + rand() * 0.3;
    takeTest(u, 'awal', awalQs, base, 27);
    // Only a few post-tests so far; the pilot is mid-semester in the demo story.
    if (i > 0 && i % 3 === 0) takeTest(u, 'akhir', akhirQs, base + (u.class_id === x1.id ? 0.12 : 0.04), 1);
  });

  // Practice attempts over four weeks.
  const practice = db().prepare("SELECT id, topic_id, answer_key FROM questions WHERE assessment_pool = 'latihan' AND status = 'terbit'").all();
  for (const u of students.filter((s) => s.class_id === x1.id)) {
    const n = 4 + Math.floor(rand() * 10);
    for (let k = 0; k < n; k++) {
      const q = practice[Math.floor(rand() * practice.length)];
      const correct = rand() < 0.6 ? 1 : 0;
      const t = daysAgo(Math.floor(rand() * 26), 14);
      insert('attempts', {
        user_id: u.id, question_id: q.id, answer: correct ? q.answer_key.split('|')[0] : '0', correct,
        hints_used: Math.floor(rand() * 4), duration_s: 60 + Math.floor(rand() * 300), created_at: t, updated_at: t,
      });
    }
  }

  // Chat history with AI answers, flags and reviews.
  const samples = [
    ['barisan-aritmetika', 'kak cara cari beda barisan kalau tau suku ke 3 sama suku ke 7 gimana', 'Aku bantu langkah demi langkah dulu, ya. Dari suku ke-3 ke suku ke-7, ada berapa langkah?', 1],
    ['logaritma', 'log 1000 itu berapa ya', 'Kalau bilangan pokok tidak ditulis, artinya 10. Jadi 10 dipangkatkan berapa supaya hasilnya 1000?', 1],
    ['fungsi-kuadrat', 'sumbu simetri x^2 - 8x + 3 gimana carinya', 'Pakai rumus x = −b/(2a). Coba tentukan dulu nilai a dan b dari soalmu.', 2],
    ['statistika', 'median itu apa sih', 'Median adalah nilai tengah setelah data diurutkan. Coba urutkan datamu dulu, lalu cari yang di tengah.', 2],
    ['trigonometri', 'sin 30 derajat berapa', 'sin 30° itu salah satu sudut istimewa. Kalau segitiga sama sisi dibelah dua, sisi depan sudut 30° sepanjang setengah sisi miring. Jadi menurutmu berapa?', 2],
    ['eksponen', '2 pangkat 3 kali 2 pangkat 4', 'Kalau bilangan pokoknya sama dan dikalikan, pangkatnya dikalikan: 2^(3×4) = 2^12.', 2],
    ['deret', 'jumlah 1 sampai 20 gimana', 'Ini deret aritmetika. Pakai Sn = n/2 × (a + Un). Berapa a dan U20-nya?', 2],
    ['barisan-geometri', 'rasio itu gimana nyarinya', 'Rasio dicari dengan membagi suku kedua dengan suku pertama. Coba bagi 6 dengan 3.', 2],
    ['spltv', 'spltv susah banget', 'Mulai dari dua persamaan yang paling mirip. Variabel mana yang bisa hilang kalau keduanya dikurangkan?', 1],
  ];
  const reasons = ['siswa_salah', 'tanya_kakak', 'kepercayaan', 'siswa_bingung', 'sampel', 'sampel', 'alat'];
  const prio = { siswa_salah: 1, tanya_kakak: 1, alat: 1, kepercayaan: 2, siswa_bingung: 2, sampel: 3 };
  const bima = staff['bima@kajar.test'];
  const verdictPool = ['benar', 'benar', 'benar', 'benar', 'perlu_koreksi', 'benar', 'perlu_koreksi', 'di_luar_kemampuan', 'benar', 'salah_berbahaya'];

  let idx = 0;
  for (let day = 26; day >= 0; day -= 1) {
    const perDay = 2 + Math.floor(rand() * 4);
    for (let k = 0; k < perDay; k++) {
      const [slug, q, a, lvl] = samples[idx++ % samples.length];
      const u = students[Math.floor(rand() * students.length)];
      if (u.class_id !== x1.id) continue;
      const t = daysAgo(day, 8 + Math.floor(rand() * 10));
      const conv = insert('conversations', { user_id: u.id, mode: 'bebas', topic_id: topicIds[slug], title: q.slice(0, 60), hint_level: lvl, attempted: 0, created_at: t, updated_at: t });
      const sm = insert('messages', { conversation_id: conv.id, role: 'student', content_redacted: q, status: 'terkirim', seen: 1, created_at: t, updated_at: t });
      const am = insert('messages', {
        conversation_id: conv.id, role: 'ai', reply_to: sm.id, content_redacted: a, topic_id: topicIds[slug], hint_level: lvl,
        confidence: 0.6 + rand() * 0.35, status: 'terkirim', model_id: 'mock-aturan-v1', prompt_version: 'tutor@1',
        latency_ms: 1200 + Math.floor(rand() * 5000), tokens_in: 900 + Math.floor(rand() * 400), tokens_out: 120 + Math.floor(rand() * 120),
        seen: 1, created_at: t, updated_at: t,
      });
      run(`INSERT INTO usage_daily (user_id, date, messages_count, tokens, bytes) VALUES (?, ?, 1, ?, ?)
        ON CONFLICT(user_id, date) DO UPDATE SET messages_count = messages_count + 1, tokens = tokens + excluded.tokens, bytes = bytes + excluded.bytes`,
      u.id, t.slice(0, 10), am.tokens_in + am.tokens_out, 2400);
      if (rand() < 0.45) {
        const src = reasons[Math.floor(rand() * reasons.length)];
        const open = day <= 2 || (day <= 4 && rand() < 0.5);
        const flag = insert('flags', {
          message_id: am.id, source: src, priority: prio[src], audience: 'peninjau', needs_reviews: rand() < 0.08 ? 2 : 1,
          status: open ? 'terbuka' : 'selesai', escalated_to: null, created_at: t, updated_at: t,
        });
        if (!open) {
          const v = slug === 'eksponen' ? 'salah_berbahaya' : verdictPool[Math.floor(rand() * verdictPool.length)];
          const score = v === 'benar' ? 4 : v === 'perlu_koreksi' ? 2 : v === 'salah_berbahaya' ? 1 : 3;
          const rt = new Date(new Date(t).getTime() + (3 + rand() * 30) * 3600e3).toISOString();
          insert('reviews', {
            message_id: am.id, flag_id: flag.id, reviewer_id: bima.id, verdict: v, seconds_spent: 60 + Math.floor(rand() * 240),
            rubric: JSON.stringify({ kebenaran: score, kejelasan: Math.max(2, score), tingkat: 3, keamanan: v === 'salah_berbahaya' ? 2 : 4 }),
            correction_text: v === 'benar' ? null : 'Pada perkalian bilangan berpangkat dengan pokok sama, pangkatnya dijumlahkan, bukan dikalikan.',
            created_at: rt, updated_at: rt,
          });
          if (v === 'salah_berbahaya') run("UPDATE messages SET status = 'dicabut' WHERE id = ?", am.id);
        }
      }
    }
  }

  // Rani: one conversation with a reviewer correction waiting to be read (home card "Catatan dari Kakak").
  const t = daysAgo(1, 19);
  const conv = insert('conversations', { user_id: rani.id, mode: 'bebas', topic_id: topicIds['barisan-aritmetika'], title: 'cara cari beda barisan', hint_level: 2, attempted: 1, created_at: t, updated_at: t });
  const s1 = insert('messages', { conversation_id: conv.id, role: 'student', content_redacted: 'kak cara cari beda barisan kalau suku ke-3 = 11 dan suku ke-7 = 23?', status: 'terkirim', seen: 1, created_at: t, updated_at: t });
  const a1 = insert('messages', { conversation_id: conv.id, role: 'ai', reply_to: s1.id, content_redacted: 'Kamu punya dua suku yang diketahui. Menurutmu, ada berapa langkah dari suku ke-3 ke suku ke-7?', topic_id: topicIds['barisan-aritmetika'], hint_level: 1, confidence: 0.82, status: 'terkirim', model_id: 'mock-aturan-v1', prompt_version: 'tutor@1', seen: 1, created_at: t, updated_at: t });
  const s2 = insert('messages', { conversation_id: conv.id, role: 'student', content_redacted: '4?', status: 'terkirim', seen: 1, created_at: t, updated_at: t });
  const a2 = insert('messages', { conversation_id: conv.id, role: 'ai', reply_to: s2.id, content_redacted: 'Tepat. Selisih nilai kedua suku terjadi setelah 4 kali menambah beda yang sama. Coba tulis hubungannya dengan kata-katamu sendiri.', topic_id: topicIds['barisan-aritmetika'], hint_level: 2, confidence: 0.74, status: 'terkirim', model_id: 'mock-aturan-v1', prompt_version: 'tutor@1', seen: 1, created_at: t, updated_at: t });
  const f = insert('flags', { message_id: a2.id, source: 'siswa_bingung', priority: 2, audience: 'peninjau', needs_reviews: 1, status: 'selesai', created_at: t, updated_at: t });
  run("UPDATE messages SET feedback = 'bingung' WHERE id = ?", a2.id);
  const rt = daysAgo(0, 8);
  insert('reviews', { message_id: a2.id, flag_id: f.id, reviewer_id: bima.id, verdict: 'perlu_koreksi', seconds_spent: 140, rubric: JSON.stringify({ kebenaran: 4, kejelasan: 2, tingkat: 3, keamanan: 4 }), correction_text: 'Tambahan: tulis seperti ini, 23 − 11 = 4 × beda. Jadi selisih 12 dibagi 4 langkah. Coba hitung bedanya, lalu cari U10.', created_at: rt, updated_at: rt });
  insert('messages', { conversation_id: conv.id, role: 'reviewer', author_name: 'Bima', reply_to: a2.id, content_redacted: 'Tambahan: tulis seperti ini, 23 − 11 = 4 × beda. Jadi selisih 12 dibagi 4 langkah. Coba hitung bedanya, lalu cari U10.', status: 'terkirim', seen: 0, created_at: rt, updated_at: rt });
  void a1;

  // A resolved low-severity incident so the incident screen has history.
  insert('safety_events', { message_id: null, class_id: x1.id, category: 'data_pribadi', severity: 'rendah', status: 'selesai', note: 'Siswa menulis nomor telepon; sudah disamarkan otomatis.', handled_by: staff['sari@kajar.test'].id, created_at: daysAgo(12), updated_at: daysAgo(11) });
}

const db = () => openDb();

if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  const path = process.env.DB_PATH || 'data/kajar.db';
  if (process.argv.includes('--reset')) {
    for (const p of [path, `${path}-wal`, `${path}-shm`]) if (existsSync(p)) rmSync(p);
  }
  openDb(path);
  if (one('SELECT id FROM users LIMIT 1')) {
    console.log('Basis data sudah berisi data. Pakai "npm run seed" untuk mengulang dari awal.');
  } else {
    seed({ demoActivity: !process.argv.includes('--tanpa-demo') });
    console.log('Seed selesai. Akun demo ada di komentar server/seed.js dan README.md.');
  }
}
