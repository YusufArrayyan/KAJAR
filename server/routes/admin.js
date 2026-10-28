// Admin API (PRD 5.8, 8.4 A1–A5).
import { one, all, insert, update, run, audit, tx } from '../db.js';
import { fail, check } from '../http.js';
import { requireRole } from '../auth.js';
import { getAllSettings, setSetting, rollbackSetting, settingVersions, DEFAULTS } from '../settings.js';
import { invalidateIndex } from '../ai/retrieve.js';
import { getProvider } from '../ai/provider.js';

const admin = requireRole('admin');
const STATUSES = ['draft', 'ditinjau', 'terbit'];

function questionView(q) {
  return {
    ...q, options: q.options ? JSON.parse(q.options) : null,
    steps: all('SELECT step_no, text FROM solution_steps WHERE question_id = ? ORDER BY step_no', q.id).map((s) => s.text),
  };
}

// F-ADM-2: validate before publishing.
export function validateQuestion(q, steps) {
  const problems = [];
  if (!q.stem || q.stem.trim().length < 10) problems.push('Teks soal minimal 10 karakter.');
  if (!q.answer_key || !String(q.answer_key).trim()) problems.push('Kunci jawaban wajib diisi.');
  if (q.type === 'pg') {
    const opts = Array.isArray(q.options) ? q.options : [];
    if (opts.length < 2) problems.push('Soal pilihan ganda butuh minimal 2 pilihan.');
    if (!opts.includes(q.answer_key)) problems.push('Kunci jawaban harus sama persis dengan salah satu pilihan.');
  }
  if (q.assessment_pool === 'latihan' && (steps.length !== 4 || steps.some((s) => !String(s).trim()))) {
    problems.push('Soal latihan butuh tepat 4 langkah solusi (petunjuk 1 sampai 4).');
  }
  return problems;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}

export default function register(r) {
  // A1 Konten
  r.get('/api/admin/questions', ({ user, query }) => {
    admin({ user });
    const status = query.get('status');
    const pool = query.get('pool') || 'latihan';
    const rows = all(
      `SELECT q.*, t.name AS topic, t.slug FROM questions q JOIN topics t ON t.id = q.topic_id
       WHERE q.assessment_pool = ? ${status && status !== 'semua' ? 'AND q.status = ?' : ''} ORDER BY t.ord, q.ord`,
      ...(status && status !== 'semua' ? [pool, status] : [pool]),
    );
    return {
      questions: rows.map((q) => ({ id: q.id, topic: q.topic, stem: q.stem, status: q.status, type: q.type, updated_at: q.updated_at })),
      topics: all('SELECT slug, name FROM topics ORDER BY ord'),
      counts: Object.fromEntries(STATUSES.map((s) => [s, one('SELECT COUNT(*) n FROM questions WHERE assessment_pool = ? AND status = ?', pool, s).n])),
    };
  });

  r.get('/api/admin/questions/:id', ({ user, params }) => {
    admin({ user });
    const q = one('SELECT q.*, t.slug FROM questions q JOIN topics t ON t.id = q.topic_id WHERE q.id = ?', params.id);
    if (!q) fail(404, 'SOAL_TIDAK_ADA', 'Soal tidak ditemukan.');
    return { question: questionView(q) };
  });

  r.post('/api/admin/questions', ({ user, body }) => saveQuestion(user, null, body));
  r.put('/api/admin/questions/:id', ({ user, params, body }) => saveQuestion(user, params.id, body));

  // CSV import: topic_slug,stem,answer_key,step1,step2,step3,step4 → always lands as draft.
  r.post('/api/admin/questions/import', ({ user, body }) => {
    admin({ user });
    const rows = parseCsv(String(body._raw || body.csv || ''));
    if (!rows.length) fail(400, 'CSV_KOSONG', 'Berkas CSV kosong.');
    const header = rows[0].map((h) => h.trim().toLowerCase());
    const need = ['topic_slug', 'stem', 'answer_key', 'step1', 'step2', 'step3', 'step4'];
    if (need.some((h, i) => header[i] !== h)) fail(400, 'KOLOM_CSV', `Baris pertama harus: ${need.join(',')}`);
    const topics = Object.fromEntries(all('SELECT id, slug FROM topics').map((t) => [t.slug, t.id]));
    const errors = [];
    let created = 0;
    tx(() => {
      rows.slice(1).forEach((r2, i) => {
        const [slug, stem, key, ...steps] = r2.map((x) => x.trim());
        const line = i + 2;
        if (!topics[slug]) return errors.push(`Baris ${line}: topik "${slug}" tidak dikenal.`);
        const problems = validateQuestion({ stem, answer_key: key, type: 'isian', assessment_pool: 'latihan' }, steps.slice(0, 4));
        if (problems.length) return errors.push(`Baris ${line}: ${problems.join(' ')}`);
        const q = insert('questions', { topic_id: topics[slug], stem, type: 'isian', options: null, answer_key: key, difficulty: 2, status: 'draft', assessment_pool: 'latihan', ord: 100 + i });
        steps.slice(0, 4).forEach((text, j) => insert('solution_steps', { question_id: q.id, step_no: j + 1, text, hint_level: j + 1 }));
        created += 1;
        return null;
      });
    });
    audit(user.id, 'impor_soal', 'questions', null, { created, errors: errors.length });
    return { created, errors };
  });

  r.get('/api/admin/chunks', ({ user }) => {
    admin({ user });
    return { chunks: all('SELECT c.id, c.kind, c.text, c.status, c.license_note, c.source_ref, t.name AS topic FROM content_chunks c JOIN topics t ON t.id = c.topic_id ORDER BY t.ord, c.kind') };
  });

  r.put('/api/admin/chunks/:id', ({ user, params, body }) => {
    admin({ user });
    const c = one('SELECT * FROM content_chunks WHERE id = ?', params.id);
    if (!c) fail(404, 'TIDAK_DITEMUKAN', 'Materi tidak ditemukan.');
    const v = check(body, {
      text: { type: 'string', label: 'Teks materi', min: 10, max: 2000 },
      status: { type: 'string', oneOf: STATUSES, label: 'Status' },
      license_note: { type: 'string', label: 'Catatan lisensi', min: 3, max: 200 },
    });
    update('content_chunks', c.id, v);
    invalidateIndex();
    audit(user.id, 'ubah_materi', 'content_chunks', c.id, { status: v.status });
    return { ok: true };
  });

  // A2 Prompt dan aturan
  r.get('/api/admin/prompts', ({ user }) => {
    admin({ user });
    return { prompts: all("SELECT id, version, body, active, created_at FROM prompt_versions WHERE name = 'tutor' ORDER BY version DESC") };
  });

  r.post('/api/admin/prompts', ({ user, body }) => {
    admin({ user });
    const { body: text } = check(body, { body: { type: 'string', label: 'Isi prompt', min: 50, max: 8000 } });
    if (!text.includes('{hint_level}') || !text.includes('{retrieved_chunks}')) {
      fail(400, 'PROMPT_KURANG', 'Prompt wajib memuat {hint_level} dan {retrieved_chunks}.');
    }
    const last = one("SELECT MAX(version) v FROM prompt_versions WHERE name = 'tutor'").v || 0;
    const p = insert('prompt_versions', { name: 'tutor', version: last + 1, body: text, active: 0, created_by: user.id });
    audit(user.id, 'prompt_baru', 'prompt_versions', p.id, { version: last + 1 });
    return { id: p.id, version: last + 1 };
  });

  r.post('/api/admin/prompts/:id/activate', ({ user, params }) => {
    admin({ user });
    const p = one('SELECT * FROM prompt_versions WHERE id = ?', params.id);
    if (!p) fail(404, 'TIDAK_DITEMUKAN', 'Versi prompt tidak ditemukan.');
    tx(() => {
      run("UPDATE prompt_versions SET active = 0 WHERE name = 'tutor'");
      run('UPDATE prompt_versions SET active = 1 WHERE id = ?', p.id);
    });
    audit(user.id, 'aktifkan_prompt', 'prompt_versions', p.id, { version: p.version });
    return { ok: true };
  });

  r.get('/api/admin/settings', ({ user }) => {
    admin({ user });
    const s = getAllSettings();
    return { settings: s, versions: Object.fromEntries(Object.keys(DEFAULTS).map((k) => [k, settingVersions(k)])) };
  });

  r.put('/api/admin/settings/:key', ({ user, params, body }) => {
    admin({ user });
    const key = params.key;
    if (!(key in DEFAULTS)) fail(404, 'PENGATURAN_TIDAK_ADA', 'Pengaturan tidak dikenal.');
    const value = validateSetting(key, body.value);
    const version = setSetting(key, value, user.id);
    return { version, value };
  });

  r.post('/api/admin/settings/:key/rollback', ({ user, params, body }) => {
    admin({ user });
    const version = rollbackSetting(params.key, Number(body.version), user.id);
    if (!version) fail(404, 'VERSI_TIDAK_ADA', 'Versi tidak ditemukan.');
    return { version };
  });

  // A4 Biaya
  r.get('/api/admin/cost', ({ user }) => {
    admin({ user });
    const s = getAllSettings();
    const days = all("SELECT date, SUM(tokens) tokens, SUM(messages_count) messages FROM usage_daily WHERE date >= date('now', '-13 day') GROUP BY date ORDER BY date");
    const perClass = all(
      `SELECT c.name, SUM(d.tokens) tokens, SUM(d.messages_count) messages FROM usage_daily d JOIN users u ON u.id = d.user_id
       JOIN classes c ON c.id = u.class_id WHERE d.date >= date('now', '-29 day') GROUP BY c.id ORDER BY tokens DESC`,
    );
    const today = days.find((d) => d.date === new Date().toISOString().slice(0, 10));
    const used = today?.tokens || 0;
    const price = s.price_per_mtok_usd;
    return {
      days, per_class: perClass, budget: s.daily_budget_tokens, used_today: used,
      share_today: Math.round((used / s.daily_budget_tokens) * 100),
      alert: used > 0.8 * s.daily_budget_tokens ? 'Pemakaian hari ini melewati 80% anggaran.' : null,
      price_per_mtok_usd: price,
      est_cost_30d_usd: price ? Math.round((perClass.reduce((a, b) => a + b.tokens, 0) / 1e6) * price * 100) / 100 : null,
      provider: getProvider().name, model: getProvider().model || null,
    };
  });

  // A5 Audit
  r.get('/api/admin/audit', ({ user, query }) => {
    admin({ user });
    const q = (query.get('q') || '').trim();
    const rows = all(
      `SELECT a.*, u.display_name AS actor FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id
       ${q ? 'WHERE a.action LIKE ? OR a.entity LIKE ?' : ''} ORDER BY a.at DESC LIMIT 200`,
      ...(q ? [`%${q}%`, `%${q}%`] : []),
    );
    return { logs: rows.map((r2) => ({ at: r2.at, actor: r2.actor || 'Sistem', role: undefined, action: r2.action, entity: r2.entity, entity_id: r2.entity_id, diff: r2.diff })) };
  });

  r.get('/api/admin/audit.csv', ({ user, res }) => {
    admin({ user });
    const rows = all('SELECT a.at, u.display_name AS actor, a.action, a.entity, a.entity_id FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id ORDER BY a.at DESC');
    res.setHeader('Content-Disposition', 'attachment; filename="kajar-audit.csv"');
    return { __raw: '﻿waktu,pelaku,aksi,entitas,id\n' + rows.map((x) => [x.at, x.actor || 'Sistem', x.action, x.entity, x.entity_id || ''].join(',')).join('\n'), type: 'text/csv; charset=utf-8' };
  });
}

function saveQuestion(user, id, body) {
  admin({ user });
  const v = check(body, {
    topic: { type: 'string', label: 'Topik', max: 60 },
    stem: { type: 'string', label: 'Teks soal', max: 1000 },
    answer_key: { type: 'string', label: 'Kunci jawaban', max: 100 },
    status: { type: 'string', oneOf: STATUSES, label: 'Status', optional: true, default: 'draft' },
  });
  const topic = one('SELECT id FROM topics WHERE slug = ?', v.topic);
  if (!topic) fail(400, 'TOPIK_TIDAK_ADA', 'Topik tidak dikenal.', { field: 'topic' });
  const steps = Array.isArray(body.steps) ? body.steps.map((s) => String(s).trim()).slice(0, 4) : [];
  const existing = id ? one('SELECT * FROM questions WHERE id = ?', id) : null;
  if (id && !existing) fail(404, 'SOAL_TIDAK_ADA', 'Soal tidak ditemukan.');
  const q = { stem: v.stem, answer_key: v.answer_key, type: existing?.type || 'isian', options: existing?.options ? JSON.parse(existing.options) : null, assessment_pool: existing?.assessment_pool || 'latihan' };
  if (v.status !== 'draft') {
    const problems = validateQuestion(q, steps);
    if (problems.length) fail(400, 'BELUM_VALID', `Belum bisa ${v.status === 'terbit' ? 'diterbitkan' : 'ditandai ditinjau'}: ${problems.join(' ')}`);
  }
  // Only a reviewed item can be published (draft → ditinjau → terbit).
  if (existing && v.status === 'terbit' && existing.status === 'draft') {
    fail(400, 'URUTAN_STATUS', 'Tandai soal sebagai "ditinjau" dulu sebelum diterbitkan.');
  }
  const saved = tx(() => {
    let row;
    if (existing) {
      update('questions', existing.id, { topic_id: topic.id, stem: v.stem, answer_key: v.answer_key, status: v.status });
      run('DELETE FROM solution_steps WHERE question_id = ?', existing.id);
      row = { id: existing.id };
    } else {
      if (v.status === 'terbit') fail(400, 'URUTAN_STATUS', 'Soal baru dimulai sebagai draf.');
      row = insert('questions', { topic_id: topic.id, stem: v.stem, type: 'isian', options: null, answer_key: v.answer_key, difficulty: 2, status: v.status, assessment_pool: 'latihan', ord: 200 });
    }
    steps.forEach((text, j) => insert('solution_steps', { question_id: row.id, step_no: j + 1, text, hint_level: j + 1 }));
    return row;
  });
  audit(user.id, existing ? 'ubah_soal' : 'buat_soal', 'questions', saved.id, { status: v.status, from: existing?.status });
  return { id: saved.id };
}

function validateSetting(key, value) {
  const def = DEFAULTS[key];
  const num = (min, max) => {
    const n = Number(value);
    if (!Number.isFinite(n) || n < min || n > max) fail(400, 'NILAI_SALAH', `Nilai harus antara ${min} dan ${max}.`);
    return n;
  };
  switch (key) {
    case 'sample_rate': case 'double_review_rate': case 'confidence_threshold': return num(0, 1);
    case 'daily_message_limit': return Math.round(num(1, 200));
    case 'daily_budget_tokens': return Math.round(num(1000, 1e9));
    case 'max_input_chars': return Math.round(num(100, 2000));
    case 'max_output_tokens': return Math.round(num(100, 2000));
    case 'reviewer_pass_score': return Math.round(num(50, 100));
    case 'sla_hours': return Math.round(num(1, 168));
    case 'price_per_mtok_usd': return value === null || value === '' ? null : num(0, 1000);
    default:
      if (typeof def === 'boolean') return Boolean(value);
      if (typeof def === 'string') {
        if (typeof value !== 'string' || !value.trim()) fail(400, 'NILAI_SALAH', 'Teks tidak boleh kosong.');
        return value.trim().slice(0, 1000);
      }
      if (Array.isArray(def)) {
        if (!Array.isArray(value)) fail(400, 'NILAI_SALAH', 'Isi berupa daftar.');
        return value.map((x) => String(x).trim().toLowerCase()).filter(Boolean).slice(0, 200);
      }
      if (def && typeof def === 'object') {
        if (!value || typeof value !== 'object') fail(400, 'NILAI_SALAH', 'Format tidak sesuai.');
        return Object.fromEntries(Object.entries(value).map(([k, arr]) => [k, (Array.isArray(arr) ? arr : []).map((x) => String(x).trim().toLowerCase()).filter(Boolean)]));
      }
      return value;
  }
}
