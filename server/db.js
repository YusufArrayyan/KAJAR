// SQLite storage (node:sqlite). Mirrors the PostgreSQL model in PRD section 10.
// Differences from the PRD are documented in docs/ARCHITECTURE.md.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS schools (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, region TEXT, connectivity_note TEXT,
  consent_status TEXT NOT NULL DEFAULT 'belum', consent_doc_ref TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS classes (
  id TEXT PRIMARY KEY, school_id TEXT NOT NULL REFERENCES schools(id), name TEXT NOT NULL,
  grade TEXT NOT NULL DEFAULT 'X', join_code_hash TEXT NOT NULL UNIQUE, join_code_active INTEGER NOT NULL DEFAULT 1,
  comparison_group TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, role TEXT NOT NULL CHECK (role IN ('student','reviewer','teacher','coordinator','admin')),
  email TEXT UNIQUE, display_name TEXT NOT NULL, nickname_key TEXT UNIQUE, pin_hash TEXT, password_hash TEXT,
  class_id TEXT REFERENCES classes(id), school_id TEXT REFERENCES schools(id), pseudonym TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'aktif', failed_logins INTEGER NOT NULL DEFAULT 0, locked_until TEXT,
  onboarded INTEGER NOT NULL DEFAULT 0, prefs TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS magic_links (
  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL, used_at TEXT
);
CREATE TABLE IF NOT EXISTS consents (
  id TEXT PRIMARY KEY, class_id TEXT NOT NULL REFERENCES classes(id), type TEXT NOT NULL CHECK (type IN ('sekolah','wali')),
  recorded_by TEXT NOT NULL REFERENCES users(id), recorded_at TEXT NOT NULL, note TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS subjects (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS topics (
  id TEXT PRIMARY KEY, subject_id TEXT NOT NULL REFERENCES subjects(id), slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
  phase TEXT NOT NULL DEFAULT 'E', ord INTEGER NOT NULL, keywords TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS content_chunks (
  id TEXT PRIMARY KEY, topic_id TEXT NOT NULL REFERENCES topics(id), kind TEXT NOT NULL DEFAULT 'materi',
  text TEXT NOT NULL, source_ref TEXT NOT NULL, license_note TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'terbit',
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY, topic_id TEXT NOT NULL REFERENCES topics(id), stem TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('pg','isian')), options TEXT, answer_key TEXT NOT NULL,
  difficulty INTEGER NOT NULL DEFAULT 2, status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','ditinjau','terbit')),
  assessment_pool TEXT NOT NULL CHECK (assessment_pool IN ('awal','akhir','latihan')), ord INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS solution_steps (
  id TEXT PRIMARY KEY, question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  step_no INTEGER NOT NULL, text TEXT NOT NULL, hint_level INTEGER NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS attempts (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, question_id TEXT NOT NULL REFERENCES questions(id),
  answer TEXT, correct INTEGER NOT NULL DEFAULT 0, hints_used INTEGER NOT NULL DEFAULT 0, duration_s INTEGER,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS assessments (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, kind TEXT NOT NULL CHECK (kind IN ('awal','akhir')),
  started_at TEXT NOT NULL, finished_at TEXT, answers TEXT NOT NULL DEFAULT '{}', score_raw INTEGER, per_topic TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE (user_id, kind)
);
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('latihan','bebas')), topic_id TEXT REFERENCES topics(id), title TEXT,
  hint_level INTEGER NOT NULL DEFAULT 0, attempted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  client_msg_id TEXT, role TEXT NOT NULL CHECK (role IN ('student','ai','reviewer','system')),
  content_redacted TEXT NOT NULL, author_name TEXT, reply_to TEXT, topic_id TEXT, hint_level INTEGER, confidence REAL,
  tool_check TEXT, status TEXT NOT NULL DEFAULT 'terkirim', feedback TEXT, model_id TEXT, prompt_version TEXT,
  latency_ms INTEGER, tokens_in INTEGER, tokens_out INTEGER, seen INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE (conversation_id, client_msg_id)
);
CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at);
CREATE TABLE IF NOT EXISTS flags (
  id TEXT PRIMARY KEY, message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('siswa_salah','siswa_bingung','tanya_kakak','kepercayaan','alat','sampel','keamanan')),
  priority INTEGER NOT NULL, audience TEXT NOT NULL DEFAULT 'peninjau', needs_reviews INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'terbuka', escalated_to TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_flags_status ON flags(status, priority, created_at);
CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY, message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE, flag_id TEXT REFERENCES flags(id),
  reviewer_id TEXT NOT NULL REFERENCES users(id), rubric TEXT NOT NULL, verdict TEXT NOT NULL
  CHECK (verdict IN ('benar','perlu_koreksi','salah_berbahaya','di_luar_kemampuan')),
  correction_text TEXT, seconds_spent INTEGER, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS safety_events (
  id TEXT PRIMARY KEY, message_id TEXT REFERENCES messages(id) ON DELETE SET NULL, class_id TEXT,
  category TEXT NOT NULL, severity TEXT NOT NULL CHECK (severity IN ('rendah','sedang','tinggi')),
  handled_by TEXT REFERENCES users(id), status TEXT NOT NULL DEFAULT 'baru', note TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY, audience_role TEXT NOT NULL, school_id TEXT, kind TEXT NOT NULL, body TEXT NOT NULL,
  link TEXT, read_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS prompt_versions (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, version INTEGER NOT NULL, body TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 0,
  created_by TEXT REFERENCES users(id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY, value TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings_history (
  id TEXT PRIMARY KEY, key TEXT NOT NULL, value TEXT NOT NULL, version INTEGER NOT NULL, changed_by TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY, actor_id TEXT, action TEXT NOT NULL, entity TEXT NOT NULL, entity_id TEXT, diff TEXT, at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reviewer_training (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, score INTEGER NOT NULL,
  passed_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS usage_daily (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, date TEXT NOT NULL, messages_count INTEGER NOT NULL DEFAULT 0,
  tokens INTEGER NOT NULL DEFAULT 0, bytes INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user_id, date)
);
CREATE TABLE IF NOT EXISTS deletion_requests (
  id TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id) ON DELETE SET NULL, pseudonym TEXT NOT NULL, class_id TEXT,
  status TEXT NOT NULL DEFAULT 'baru', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
`;

export const now = () => new Date().toISOString();
export const uid = () => randomUUID();

let db;

export function openDb(path = process.env.DB_PATH || 'data/kajar.db') {
  if (db) return db;
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');
  db.exec(SCHEMA);
  return db;
}

export function getDb() {
  return db || openDb();
}

export function closeDb() {
  if (db) db.close();
  db = undefined;
}

// Small helpers so route code stays readable.
export const one = (sql, ...p) => getDb().prepare(sql).get(...p);
export const all = (sql, ...p) => getDb().prepare(sql).all(...p);
export const run = (sql, ...p) => getDb().prepare(sql).run(...p);

export function insert(table, row) {
  const t = now();
  const full = { id: uid(), created_at: t, updated_at: t, ...row };
  if (table === 'audit_logs' || table === 'settings_history') {
    delete full.updated_at;
    if (table === 'audit_logs') delete full.created_at;
  }
  const keys = Object.keys(full);
  getDb().prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`)
    .run(...keys.map((k) => full[k]));
  return full;
}

export function update(table, id, patch) {
  const full = { ...patch, updated_at: now() };
  const keys = Object.keys(full);
  getDb().prepare(`UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`)
    .run(...keys.map((k) => full[k]), id);
}

export function tx(fn) {
  const d = getDb();
  d.exec('BEGIN');
  try {
    const r = fn();
    d.exec('COMMIT');
    return r;
  } catch (e) {
    d.exec('ROLLBACK');
    throw e;
  }
}

export function audit(actorId, action, entity, entityId, diff) {
  insert('audit_logs', {
    actor_id: actorId || null, action, entity, entity_id: entityId || null,
    diff: diff === undefined ? null : JSON.stringify(diff), at: now(),
  });
}
