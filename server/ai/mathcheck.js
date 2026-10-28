// Deterministic arithmetic checker (PRD F-CHAT-6, 9.1 step 7).
// Parses "expression = number" claims in a reply and recomputes the left side.
// Supports + - * / ^, parentheses, decimals with "." or ",", "x" / "×" / "·" for multiply, ":" for divide, √ and %.

function tokenize(src) {
  const s = src
    .replace(/[×·]/g, '*')
    .replace(/(\d)\s*[xX]\s*(?=[\d(])/g, '$1*')
    .replace(/:/g, '/')
    .replace(/−/g, '-')
    .replace(/(\d),(\d)/g, '$1.$2');
  const out = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === ' ') { i++; continue; }
    if (/[\d.]/.test(c)) {
      let j = i;
      while (j < s.length && /[\d.]/.test(s[j])) j++;
      const n = Number(s.slice(i, j));
      if (!Number.isFinite(n)) return null;
      out.push({ t: 'n', v: n });
      i = j;
      continue;
    }
    if ('+-*/^()%√'.includes(c)) { out.push({ t: c }); i++; continue; }
    return null;
  }
  return out;
}

// Recursive-descent parser; returns a number or null when the input is not pure arithmetic.
export function evaluate(src) {
  const toks = tokenize(String(src));
  if (!toks || !toks.length) return null;
  let p = 0;
  const peek = () => toks[p];
  const eat = (t) => (toks[p] && toks[p].t === t ? toks[p++] : null);

  function primary() {
    if (eat('(')) {
      const v = expr();
      if (!eat(')')) throw new Error('paren');
      return v;
    }
    if (eat('√')) return Math.sqrt(unary());
    const n = eat('n');
    if (!n) throw new Error('num');
    if (eat('%')) return n.v / 100;
    return n.v;
  }
  function unary() {
    if (eat('-')) return -unary();
    if (eat('+')) return unary();
    return power();
  }
  function power() {
    const base = primary();
    if (eat('^')) return base ** unary();
    return base;
  }
  function term() {
    let v = unary();
    for (;;) {
      if (eat('*')) v *= unary();
      else if (eat('/')) {
        const d = unary();
        if (d === 0) throw new Error('div0');
        v /= d;
      } else if (peek() && (peek().t === '(' || peek().t === 'n' || peek().t === '√')) v *= unary();
      else return v;
    }
  }
  function expr() {
    let v = term();
    for (;;) {
      if (eat('+')) v += term();
      else if (eat('-')) v -= term();
      else return v;
    }
  }
  try {
    const v = expr();
    if (p !== toks.length || !Number.isFinite(v)) return null;
    return v;
  } catch {
    return null;
  }
}

// A claim must start a fresh expression (not the tail of "x + 2 = …" or "3² − 6 × 3 = …") and its
// right side must be a lone number (not "= 5 × (6 + 36)" or "= 2^5").
const CLAIM = /(?<![\d.,)\-−+*/×x:^²³√]\s*)([-−]?[\d(√][\d\s.,+\-*/^()x×·:√%−]*[\d)%])\s*=\s*([-−]?\d+(?:[.,]\d+)?)(?![\d.,]*\s*[a-z(²³×*/+\-−:^√])/gi;

export function verifyClaims(text) {
  const mismatches = [];
  let checked = 0;
  for (const m of String(text).matchAll(CLAIM)) {
    const left = m[1].trim();
    if (!/[+\-*/^x×·:√%]/.test(left.replace(/^-/, ''))) continue; // plain "12 = 12" style restatements
    const lv = evaluate(left);
    if (lv === null) continue;
    const rv = Number(m[2].replace('−', '-').replace(',', '.'));
    checked++;
    if (Math.abs(lv - rv) > 1e-6 * Math.max(1, Math.abs(rv))) {
      mismatches.push({ claim: m[0].trim(), expected: Math.round(lv * 1e6) / 1e6 });
    }
  }
  return { checked, mismatches, ok: mismatches.length === 0 };
}

// Compare a student's answer to an answer key ("a|b|c" alternatives).
export function answersMatch(given, key) {
  const norm = (s) => String(s).toLowerCase().replace(/\s+/g, '').replace(/,/g, '.').replace(/^([a-z])=/, '');
  const g = norm(given);
  if (!g) return false;
  return String(key).split('|').some((alt) => {
    const k = norm(alt);
    if (g === k) return true;
    const gv = evaluate(g);
    const kv = evaluate(k);
    return gv !== null && kv !== null && Math.abs(gv - kv) < 1e-6 * Math.max(1, Math.abs(kv));
  });
}
