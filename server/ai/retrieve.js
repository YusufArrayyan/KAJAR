// Material retrieval (PRD F-CHAT-3, 9.1 step 4).
// Lexical BM25 over published content chunks plus topic keyword boost. The LLMProvider.embed
// hook exists for a vector index later (pgvector in the PRD); lexical search keeps the pilot offline-friendly.
import { all } from '../db.js';

const STOP = new Set(
  ('yang dan di ke dari ini itu untuk dengan pada adalah atau juga akan bisa ada tidak gak ga nggak aku kamu saya kak ' +
    'gimana bagaimana cara apa apakah berapa kenapa mengapa dong sih ya yah nih tuh kok deh aja saja tolong bantu ' +
    'mau ingin jadi kalau kalo jika lalu terus trus maka nya soal jawab jawaban tentang mencari cari tentukan hitung').split(' '),
);

export function tokens(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map((w) => w.replace(/^(meng|meny|mem|men|me|ber|ter|di|ke|se)(?=\w{4,})/, '').replace(/(nya|lah|kah|kan|an|i)$/, (s, _x, off, str) => (str.length - s.length >= 4 ? '' : s)));
}

let cache = null;
export function invalidateIndex() {
  cache = null;
}

function buildIndex() {
  const chunks = all(
    `SELECT c.id, c.topic_id, c.kind, c.text, c.source_ref, t.name AS topic_name, t.slug, t.keywords
     FROM content_chunks c JOIN topics t ON t.id = c.topic_id WHERE c.status = 'terbit'`,
  );
  const docs = chunks.map((c) => {
    const toks = tokens(`${c.topic_name} ${c.keywords} ${c.text}`);
    const tf = new Map();
    for (const t of toks) tf.set(t, (tf.get(t) || 0) + 1);
    return { ...c, tf, len: toks.length };
  });
  const df = new Map();
  for (const d of docs) for (const t of d.tf.keys()) df.set(t, (df.get(t) || 0) + 1);
  const avg = docs.reduce((s, d) => s + d.len, 0) / Math.max(1, docs.length);
  const topicKw = new Map();
  for (const c of chunks) {
    if (!topicKw.has(c.topic_id)) topicKw.set(c.topic_id, new Set(tokens(`${c.topic_name} ${c.keywords}`)));
  }
  return { docs, df, avg, N: docs.length, topicKw };
}

// Returns { topic: {id, name, slug} | null, chunks: [...], score: 0..1 }
export function retrieve(query, { k = 4, topicHint = null } = {}) {
  cache ||= buildIndex();
  const { docs, df, avg, N, topicKw } = cache;
  const q = [...new Set(tokens(query))];
  if (!q.length || !N) return { topic: null, chunks: [], score: 0 };
  const k1 = 1.4;
  const b = 0.75;
  const scored = docs.map((d) => {
    let s = 0;
    for (const t of q) {
      const f = d.tf.get(t);
      if (!f) continue;
      const idf = Math.log(1 + (N - df.get(t) + 0.5) / (df.get(t) + 0.5));
      s += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.len) / avg)));
    }
    const kwHits = q.filter((t) => topicKw.get(d.topic_id).has(t)).length;
    s += kwHits * 1.5;
    if (topicHint && d.topic_id === topicHint) s += 0.8;
    return { d, s, kwHits };
  });
  scored.sort((a, b2) => b2.s - a.s);
  const best = scored[0];
  if (!best || best.s < 1.2) return { topic: null, chunks: [], score: 0 };
  const topicId = best.d.topic_id;
  const top = scored.filter((x) => x.s > 0 && x.d.topic_id === topicId).slice(0, k);
  // Map raw score to 0..1: two keyword hits or a strong lexical match reads as "confident".
  const score = Math.min(1, best.s / 7);
  return {
    topic: { id: topicId, name: best.d.topic_name, slug: best.d.slug },
    chunks: top.map(({ d }) => ({ id: d.id, kind: d.kind, text: d.text, source_ref: d.source_ref })),
    score,
  };
}

export function chunksForTopic(topicId) {
  return all("SELECT id, kind, text, source_ref FROM content_chunks WHERE topic_id = ? AND status = 'terbit'", topicId);
}
