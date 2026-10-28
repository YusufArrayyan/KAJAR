// Input/output safety filters and PII redaction (PRD 5.9, 9.1 steps 1, 2, 9).

const PII_PATTERNS = [
  { type: 'telepon', re: /(?:\+62|62|0)[\s-]?8\d{1,2}[\s-]?\d{3,4}[\s-]?\d{3,5}/g, mask: '[nomor disamarkan]' },
  { type: 'email', re: /[\w.+-]+@[\w-]+\.[\w.-]+/g, mask: '[email disamarkan]' },
  { type: 'nik', re: /\b\d{16}\b/g, mask: '[nomor identitas disamarkan]' },
  {
    type: 'alamat',
    re: /\b(?:jl|jln|jalan|gg|gang|komplek|perum(?:ahan)?)\.?\s+[a-z0-9 .'-]{2,40}?(?:\s+no\.?\s*\d+[a-z]?)?(?=[,.;!?\n]|$)/gi,
    mask: '[alamat disamarkan]',
  },
  { type: 'alamat', re: /\brt\.?\s*\d{1,3}\s*\/?\s*rw\.?\s*\d{1,3}\b/gi, mask: '[alamat disamarkan]' },
];

export function redactPII(text) {
  let out = String(text);
  const found = new Set();
  for (const p of PII_PATTERNS) {
    out = out.replace(p.re, () => {
      found.add(p.type);
      return p.mask;
    });
  }
  return { text: out, found: [...found] };
}

export const normalize = (text) =>
  String(text).normalize('NFKC').replace(/\s+/g, ' ').trim();

const lower = (s) => ` ${String(s).toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, ' ').replace(/\s+/g, ' ')} `;

function matchAny(text, list) {
  const t = lower(text);
  return list.find((w) => t.includes(` ${w.toLowerCase()}`)) || null;
}

// Returns { severity: 'tinggi' | 'sedang' | null, term }
export function checkInput(text, patterns) {
  const hi = matchAny(text, patterns.tinggi || []);
  if (hi) return { severity: 'tinggi', term: hi, category: 'keselamatan' };
  const mid = matchAny(text, patterns.sedang || []);
  if (mid) return { severity: 'sedang', term: mid, category: 'emosional' };
  return { severity: null };
}

const DIRECT_ANSWER = [
  'langsung jawab', 'jawab aja', 'jawab saja', 'kasih jawaban', 'kasih jawabannya', 'jawabannya apa', 'apa jawabannya',
  'berapa jawabannya', 'minta jawaban', 'minta jawabannya', 'jawaban akhir', 'langsung hasil', 'langsung hasilnya',
  'kasih tau jawabannya', 'kasih tahu jawabannya', 'kunci jawaban', 'jawabin', 'kerjain', 'kerjakan soal ini',
  'tanpa penjelasan', 'skip penjelasan', 'gak usah dijelasin', 'ga usah dijelasin', 'tidak usah dijelaskan',
  'just answer', 'give me the answer', 'hasilnya aja', 'hasilnya saja', 'jawaban doang', 'final answer',
];
const MORE_HINT = [
  'petunjuk', 'hint', 'clue', 'masih bingung', 'belum paham', 'belum ngerti', 'gak ngerti', 'ga ngerti', 'nggak ngerti',
  'tidak paham', 'gak paham', 'ga paham', 'nggak paham', 'bingung', 'lanjut', 'terus gimana', 'terus bagaimana', 'trus gimana',
  'selanjutnya', 'bantu lagi', 'kasih clue',
];
const FULL_STEPS = ['langkah lengkap', 'semua langkah', 'cara lengkap', 'pembahasan lengkap', 'lihat pembahasan', 'tunjukkan langkah', 'jelaskan semua'];

export function classifyIntent(text, refusedTopics) {
  const t = lower(text);
  const has = (list) => list.some((w) => t.includes(` ${w}`));
  if (has(FULL_STEPS)) return 'langkah_lengkap';
  if (has(DIRECT_ANSWER)) return 'minta_jawaban';
  const off = matchAny(text, refusedTopics || []);
  if (off) return 'di_luar_belajar';
  if (has(MORE_HINT)) return 'minta_petunjuk';
  return 'belajar';
}

// A message "looks like an attempt" when it carries the student's own working.
export function looksLikeAttempt(text) {
  const t = String(text).toLowerCase();
  if (/jawab(an)?ku|aku dapat|aku dapet|hasilku|menurutku|kayaknya|apakah\s+\S*\s*=|=\s*-?\d/.test(t)) return true;
  if (/\d\s*[-+x×*/:]\s*\d/.test(t)) return true;
  return /^\s*-?\d+(?:[.,]\d+)?\s*\??\s*$/.test(t);
}

const FINAL_LEAK = [/jawaban(nya)?\s+(akhir(nya)?\s+)?(adalah|yaitu|ialah)/i, /jadi[, ]+(hasil|jawaban)(nya)?\s*(adalah|=)/i, /hasil akhir(nya)?\s*(adalah|=)/i];

// Output checks (step 9). Returns list of violation codes.
export function checkOutput(reply, { hintLevel, banned = [], maxWords = 150 }) {
  const v = [];
  if (!reply || !String(reply).trim()) v.push('kosong');
  const words = String(reply).trim().split(/\s+/).length;
  if (words > maxWords + 30) v.push('terlalu_panjang');
  if (hintLevel < 4 && FINAL_LEAK.some((re) => re.test(reply))) v.push('bocor_jawaban');
  if (matchAny(reply, banned)) v.push('kata_terlarang');
  return v;
}

export function trimWords(text, max = 150) {
  const words = String(text).trim().split(/\s+/);
  if (words.length <= max) return String(text).trim();
  return words.slice(0, max).join(' ') + '…';
}
