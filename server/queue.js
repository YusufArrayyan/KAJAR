// Reviewer queue rules (PRD F-REV-1, 9.4).
import { one, all, insert, update, now } from './db.js';
import { getSetting } from './settings.js';

// Lower number = higher priority. "keamanan" with severity tinggi never reaches student reviewers.
export const PRIORITY = { keamanan: 0, siswa_salah: 1, tanya_kakak: 1, alat: 1, kepercayaan: 2, siswa_bingung: 2, sampel: 3 };

export const REASON_LABEL = {
  keamanan: 'Keamanan', siswa_salah: 'Ditandai siswa: “Salah”', siswa_bingung: 'Ditandai siswa: “Membingungkan”',
  tanya_kakak: 'Tanya Kakak', kepercayaan: 'Kepercayaan rendah', alat: 'Hitungan tidak cocok', sampel: 'Sampel acak',
};

export function addFlag(messageId, source, { audience = 'peninjau', rand = Math.random } = {}) {
  const priority = PRIORITY[source];
  const open = one("SELECT * FROM flags WHERE message_id = ? AND status = 'terbuka'", messageId);
  if (open) {
    // One open item per message: keep the most urgent reason and the strictest audience.
    const patch = {};
    if (priority < open.priority) Object.assign(patch, { priority, source });
    if (audience === 'dewasa' && open.audience !== 'dewasa') patch.audience = 'dewasa';
    if (Object.keys(patch).length) update('flags', open.id, patch);
    return { ...open, ...patch };
  }
  const needs = rand() < getSetting('double_review_rate') ? 2 : 1;
  return insert('flags', { message_id: messageId, source, priority, audience, needs_reviews: needs, status: 'terbuka' });
}

export function maybeSample(messageId, rand = Math.random) {
  if (one("SELECT id FROM flags WHERE message_id = ?", messageId)) return null;
  if (rand() < getSetting('sample_rate')) return addFlag(messageId, 'sampel', { rand });
  return null;
}

export function overdueCount() {
  const cutoff = new Date(Date.now() - getSetting('sla_hours') * 3600e3).toISOString();
  return one("SELECT COUNT(*) AS n FROM flags WHERE status = 'terbuka' AND audience = 'peninjau' AND created_at < ?", cutoff).n;
}

export function notify(audienceRole, kind, body, { schoolId = null, link = null } = {}) {
  return insert('notifications', { audience_role: audienceRole, school_id: schoolId, kind, body, link, read_at: null });
}

// Coordinator alert when items wait past the SLA (PRD 9.4 last line). Deduplicated per day.
export function checkOverdue() {
  const n = overdueCount();
  if (!n) return 0;
  const today = now().slice(0, 10);
  const exists = all("SELECT id FROM notifications WHERE kind = 'antrean_tertunda' AND substr(created_at,1,10) = ?", today);
  if (!exists.length) {
    notify('coordinator', 'antrean_tertunda', `${n} item antrean menunggu lebih dari ${getSetting('sla_hours')} jam.`, { link: '/dasbor/program' });
  }
  return n;
}
