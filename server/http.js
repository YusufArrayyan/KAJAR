// Minimal HTTP toolkit: router, JSON I/O, cookies, uniform errors, rate limiting.
import { gzipSync, brotliCompressSync, constants as zc } from 'node:zlib';

export class HttpError extends Error {
  constructor(status, code, message, extra) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export const fail = (status, code, message, extra) => {
  throw new HttpError(status, code, message, extra);
};

export function createRouter() {
  const routes = [];
  const add = (method, path, ...handlers) => {
    const keys = [];
    const re = new RegExp('^' + path.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '/?$');
    routes.push({ method, re, keys, handlers });
  };
  return {
    get: (p, ...h) => add('GET', p, ...h),
    post: (p, ...h) => add('POST', p, ...h),
    put: (p, ...h) => add('PUT', p, ...h),
    del: (p, ...h) => add('DELETE', p, ...h),
    match(method, pathname) {
      for (const r of routes) {
        if (r.method !== method) continue;
        const m = r.re.exec(pathname);
        if (m) {
          const params = {};
          r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
          return { handlers: r.handlers, params };
        }
      }
      return null;
    },
  };
}

export async function readJson(req, limit = 64 * 1024) {
  if (req.method === 'GET' || req.method === 'HEAD') return {};
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > limit) fail(413, 'TERLALU_BESAR', 'Data yang dikirim terlalu besar.');
    chunks.push(c);
  }
  if (!size) return {};
  const ct = req.headers['content-type'] || '';
  const raw = Buffer.concat(chunks).toString('utf8');
  if (ct.includes('text/csv') || ct.includes('text/plain')) return { _raw: raw };
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' ? v : {};
  } catch {
    fail(400, 'JSON_RUSAK', 'Format data tidak terbaca. Muat ulang halaman lalu coba lagi.');
  }
}

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function setCookie(res, name, value, { maxAge, clear } = {}) {
  const secure = process.env.COOKIE_SECURE === '1' ? '; Secure' : '';
  const age = clear ? '; Max-Age=0' : maxAge ? `; Max-Age=${maxAge}` : '';
  const prev = res.getHeader('Set-Cookie');
  const cookie = `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax${secure}${age}`;
  res.setHeader('Set-Cookie', prev ? [].concat(prev, cookie) : cookie);
}

// Compress small JSON responses; PRD 12.1 budgets every chat exchange at <=3 KB compressed.
export function send(req, res, status, body, type = 'application/json; charset=utf-8') {
  let buf = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
  const ae = req.headers['accept-encoding'] || '';
  res.setHeader('Content-Type', type);
  res.setHeader('Vary', 'Accept-Encoding');
  if (buf.length > 512) {
    if (ae.includes('br')) {
      buf = brotliCompressSync(buf, { params: { [zc.BROTLI_PARAM_QUALITY]: 5 } });
      res.setHeader('Content-Encoding', 'br');
    } else if (ae.includes('gzip')) {
      buf = gzipSync(buf);
      res.setHeader('Content-Encoding', 'gzip');
    }
  }
  res.setHeader('Content-Length', buf.length);
  res.writeHead(status);
  res.end(buf);
  return buf.length;
}

// Fixed-window limiter kept in memory. Good enough for a single-node pilot.
const buckets = new Map();
export function rateLimit(key, max, windowMs) {
  const t = Date.now();
  const b = buckets.get(key);
  if (!b || t > b.reset) {
    buckets.set(key, { count: 1, reset: t + windowMs });
    return;
  }
  b.count += 1;
  if (b.count > max) {
    const wait = Math.ceil((b.reset - t) / 1000);
    fail(429, 'TERLALU_CEPAT', `Terlalu banyak permintaan. Tunggu ${wait} detik lalu coba lagi.`, { retry_after: wait });
  }
}
export const resetRateLimits = () => buckets.clear();

// Behind a reverse proxy (Render, Fly, Nginx) set TRUST_PROXY=1. The proxy appends the real client
// address as the last X-Forwarded-For entry; earlier entries can be forged by the client.
export function clientIp(req) {
  if (process.env.TRUST_PROXY === '1') {
    const xff = String(req.headers['x-forwarded-for'] || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (xff.length) return xff[xff.length - 1];
  }
  return req.socket.remoteAddress || 'unknown';
}

// Tiny schema validator (stand-in for Zod so the server stays dependency-free).
export function check(body, spec) {
  const out = {};
  for (const [key, rule] of Object.entries(spec)) {
    let v = body[key];
    if (v === undefined || v === null || v === '') {
      if (rule.optional) {
        out[key] = rule.default;
        continue;
      }
      fail(400, 'DATA_KURANG', rule.msg || `Kolom "${rule.label || key}" wajib diisi.`, { field: key });
    }
    if (rule.type === 'string') {
      v = String(v).trim();
      if (rule.max && v.length > rule.max) fail(400, 'TERLALU_PANJANG', `${rule.label || key} maksimal ${rule.max} karakter.`, { field: key });
      if (rule.min && v.length < rule.min) fail(400, 'TERLALU_PENDEK', rule.msg || `${rule.label || key} minimal ${rule.min} karakter.`, { field: key });
      if (rule.pattern && !rule.pattern.test(v)) fail(400, 'FORMAT_SALAH', rule.msg || `Format ${rule.label || key} belum sesuai.`, { field: key });
      if (rule.oneOf && !rule.oneOf.includes(v)) fail(400, 'PILIHAN_SALAH', `Pilihan ${rule.label || key} tidak dikenal.`, { field: key });
    } else if (rule.type === 'int') {
      v = Number(v);
      if (!Number.isInteger(v) || (rule.min !== undefined && v < rule.min) || (rule.max !== undefined && v > rule.max)) {
        fail(400, 'ANGKA_SALAH', `${rule.label || key} harus angka ${rule.min} sampai ${rule.max}.`, { field: key });
      }
    } else if (rule.type === 'number') {
      v = Number(v);
      if (!Number.isFinite(v)) fail(400, 'ANGKA_SALAH', `${rule.label || key} harus angka.`, { field: key });
    } else if (rule.type === 'bool') {
      v = Boolean(v);
    } else if (rule.type === 'object') {
      if (typeof v !== 'object') fail(400, 'FORMAT_SALAH', `Format ${rule.label || key} belum sesuai.`, { field: key });
    }
    out[key] = v;
  }
  return out;
}
