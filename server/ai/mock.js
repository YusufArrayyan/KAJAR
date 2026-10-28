// Rule-based provider for demos, tests and outages. It never invents facts: every sentence is
// assembled from curated material chunks (kinds: penuntun, materi, contoh, serupa).

const pick = (chunks, kind) => chunks.filter((c) => c.kind === kind);

function steps(exampleText) {
  return String(exampleText)
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

export const mockProvider = {
  name: 'mock',
  model: 'mock-aturan-v1',
  async generate({ context }) {
    const { hintLevel, topic, chunks = [], retrievalScore = 0 } = context;
    if (!topic || !chunks.length) {
      return {
        out: { reply: '', topic: '', confidence: 0, claims_to_check: [], hint_level_used: hintLevel },
        model_id: this.model, tokens_in: 0, tokens_out: 0,
      };
    }
    const guide = pick(chunks, 'penuntun')[0]?.text;
    const concept = pick(chunks, 'materi')[0]?.text || '';
    const example = steps(pick(chunks, 'contoh')[0]?.text || '');
    const similar = pick(chunks, 'serupa')[0]?.text;
    let reply;
    if (hintLevel <= 1) {
      reply = guide || `Kita mulai dari yang kamu tahu. Data apa saja yang diberikan soalmu tentang ${topic.name}?`;
    } else if (hintLevel === 2) {
      const firstSentences = concept.split(/(?<=\.)\s+/).slice(0, 3).join(' ');
      reply = `${firstSentences} Coba masukkan angka dari soalmu ke rumus itu. Bagian mana yang sudah bisa kamu isi?`;
    } else if (hintLevel === 3) {
      const intro = example[0] || '';
      const first = example.find((s) => /^langkah 1/i.test(s)) || example[1] || '';
      reply = `Aku contohkan langkah pertama dengan soal mirip. ${intro} ${first} Sekarang coba langkah yang sama untuk soalmu. Hasilnya berapa?`;
    } else {
      reply = `Ini pembahasan lengkap untuk soal yang mirip, langkah demi langkah:\n${example.join('\n')}\n${similar ? `Sekarang giliranmu: ${similar}` : 'Sekarang coba ulangi dengan angka di soalmu.'}`;
    }
    return {
      out: {
        reply,
        topic: topic.name,
        confidence: Math.min(0.95, 0.45 + retrievalScore * 0.5),
        claims_to_check: [],
        hint_level_used: Math.max(1, hintLevel),
      },
      model_id: this.model,
      tokens_in: 0,
      tokens_out: 0,
    };
  },
  async classify() { return null; },
  async embed() { return null; },
};
