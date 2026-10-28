// Versioned runtime configuration (PRD 5.8 F-ADM-3, F-ADM-4). Every change keeps history and can be rolled back.
import { one, all, run, insert, now, audit } from './db.js';

export const DEFAULTS = {
  sample_rate: 0.1, // F-REV-1 (e): random sample of otherwise unflagged answers
  double_review_rate: 0.05, // F-REV-7
  confidence_threshold: 0.7, // 9.4
  daily_message_limit: 30, // F-CHAT-8
  daily_budget_tokens: 400000, // 9.5 hard budget; above it chat falls back to Practice only
  max_input_chars: 600,
  max_output_tokens: 400,
  reviewer_pass_score: 80, // F-REV-6
  sla_hours: 24,
  show_numeric_score: false, // S10
  posttest_open: false, // coordinator opens the post-test at the end of the semester
  price_per_mtok_usd: null, // [PERLU DIVERIFIKASI] fill from the provider's current price list
  refused_topics: [
    'game', 'gim', 'pacar', 'pacaran', 'gosip', 'judi', 'slot', 'taruhan', 'film', 'drakor', 'anime',
    'politik', 'partai', 'capres', 'saham', 'kripto', 'crypto', 'joki', 'contekan ujian',
  ],
  safety_patterns: {
    tinggi: [
      'bunuh diri', 'ingin mati', 'pengen mati', 'mau mati aja', 'akhiri hidup', 'menyakiti diri', 'nyakitin diri',
      'melukai diri', 'sayat', 'self harm', 'gantung diri', 'dipukuli', 'disiksa', 'dilecehkan', 'pelecehan',
      'diraba', 'diancam', 'diancem', 'ngancem', 'ngancam', 'mengancam aku', 'dipukul', 'mukulin aku', 'nyiksa aku',
      'dilecehin', 'mau bunuh', 'membunuh orang', 'mati aja',
    ],
    sedang: ['stres banget', 'depresi', 'putus asa', 'nggak ada yang peduli', 'gak ada yang peduli', 'dibully', 'di-bully', 'sendirian terus', 'capek hidup'],
  },
  output_banned: ['bunuh diri', 'narkoba', 'senjata', 'judi', 'porno', 'seks'],
  help_text:
    'Butuh bicara dengan orang dewasa? Bicarakan dengan gurumu, wali kelas, guru BK, atau orang tuamu.',
  help_contacts: '[ISI SETELAH DIVERIFIKASI: kontak bantuan resmi dari sumber pemerintah]',
  incident_recipients: ['teacher', 'coordinator'],
};

export function getSetting(key) {
  const row = one('SELECT value FROM settings WHERE key = ?', key);
  return row ? JSON.parse(row.value) : DEFAULTS[key];
}

export function getAllSettings() {
  const out = { ...DEFAULTS };
  for (const r of all('SELECT key, value, version FROM settings')) out[r.key] = JSON.parse(r.value);
  return out;
}

export function settingVersions(key) {
  return all('SELECT version, value, changed_by, created_at FROM settings_history WHERE key = ? ORDER BY version DESC LIMIT 20', key)
    .map((r) => ({ ...r, value: JSON.parse(r.value) }));
}

export function setSetting(key, value, actorId) {
  if (!(key in DEFAULTS)) throw new Error('unknown setting ' + key);
  const prev = one('SELECT value, version FROM settings WHERE key = ?', key);
  const version = prev ? prev.version + 1 : 1;
  const json = JSON.stringify(value);
  run(
    'INSERT INTO settings (key, value, version, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, version = excluded.version, updated_at = excluded.updated_at',
    key, json, version, now(),
  );
  insert('settings_history', { key, value: json, version, changed_by: actorId || null });
  audit(actorId, 'ubah_pengaturan', 'settings', key, { from: prev ? JSON.parse(prev.value) : DEFAULTS[key], to: value });
  return version;
}

export function rollbackSetting(key, version, actorId) {
  const h = one('SELECT value FROM settings_history WHERE key = ? AND version = ?', key, version);
  if (!h) return null;
  return setSetting(key, JSON.parse(h.value), actorId);
}

export function activePrompt() {
  return one("SELECT * FROM prompt_versions WHERE name = 'tutor' AND active = 1 ORDER BY version DESC LIMIT 1");
}
