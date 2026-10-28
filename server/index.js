// KAJAR server entry: static PWA shell + JSON API. Zero runtime dependencies.
import { createServer } from 'node:http';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, extname, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { gzipSync, brotliCompressSync, constants as zc } from 'node:zlib';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Minimal .env loader so `npm start` works without extra packages.
function loadEnv() {
  const p = join(ROOT, '.env');
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
if (process.env.NODE_ENV !== 'test') loadEnv(); // tests must not depend on a developer's .env

const { openDb, one } = await import('./db.js');
const { createRouter, readJson, send, HttpError } = await import('./http.js');
const { currentUser } = await import('./auth.js');
const { checkOverdue } = await import('./queue.js');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
};

// Pre-compress the whole public/ folder once; it is small by design (PRD 12.1).
function loadStatic(dir = join(ROOT, 'public'), base = '') {
  const files = new Map();
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const rel = `${base}/${name}`;
    if (statSync(full).isDirectory()) {
      for (const [k, v] of loadStatic(full, rel)) files.set(k, v);
      continue;
    }
    const raw = readFileSync(full);
    const type = MIME[extname(name)] || 'application/octet-stream';
    const compressible = !type.startsWith('image/png');
    files.set(rel, {
      raw, type, etag: `"${createHash('sha1').update(raw).digest('base64url').slice(0, 16)}"`,
      br: compressible ? brotliCompressSync(raw, { params: { [zc.BROTLI_PARAM_QUALITY]: 11 } }) : null,
      gz: compressible ? gzipSync(raw, { level: 9 }) : null,
    });
  }
  return files;
}

// Stamp the service worker with a hash of every other public file so each deploy refreshes caches.
function stampWorker(files) {
  const sw = files.get('/sw.js');
  if (!sw) return;
  const h = createHash('sha1');
  for (const [k, v] of [...files].sort()) if (k !== '/sw.js') h.update(k).update(v.etag);
  const raw = Buffer.from(sw.raw.toString('utf8').replace('__KAJAR_SW_VERSION__', h.digest('hex').slice(0, 10)));
  files.set('/sw.js', { ...sw, raw, etag: `"${createHash('sha1').update(raw).digest('base64url').slice(0, 16)}"`, br: brotliCompressSync(raw), gz: gzipSync(raw) });
}

const CSP = [
  "default-src 'self'", "script-src 'self'", "style-src 'self'", "img-src 'self' data:", "connect-src 'self'",
  "manifest-src 'self'", "worker-src 'self'", "frame-ancestors 'none'", "base-uri 'none'", "form-action 'self'", "object-src 'none'",
].join('; ');

function securityHeaders(res) {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  if (process.env.COOKIE_SECURE === '1') res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
}

export async function buildApp({ dbPath } = {}) {
  openDb(dbPath);
  if (!one('SELECT id FROM users LIMIT 1')) {
    const { seed } = await import('./seed.js');
    seed();
    console.log(JSON.stringify({ level: 'info', event: 'seed_otomatis', note: 'Basis data kosong, data demo dibuat.' }));
  }
  const router = createRouter();
  for (const mod of ['auth', 'student', 'review', 'dash', 'admin']) {
    (await import(`./routes/${mod}.js`)).default(router);
  }
  router.get('/api/health', () => ({ ok: true }));
  let files = loadStatic();
  stampWorker(files);
  // Outside production, pick up edits to public/ without a restart.
  if (process.env.NODE_ENV !== 'production') {
    const fp = () => readdirSync(join(ROOT, 'public'), { recursive: true }).map((f) => {
      try { return statSync(join(ROOT, 'public', String(f))).mtimeMs; } catch { return 0; }
    }).join();
    let last = fp();
    setInterval(() => {
      const now = fp();
      if (now !== last) { last = now; files = loadStatic(); stampWorker(files); }
    }, 1000).unref();
  }

  async function handle(req, res) {
    securityHeaders(res);
    const url = new URL(req.url, 'http://localhost');
    const started = Date.now();
    if (url.pathname.startsWith('/api/')) {
      res.setHeader('Cache-Control', 'no-store');
      try {
        const m = router.match(req.method, url.pathname);
        if (!m) throw new HttpError(404, 'TIDAK_DITEMUKAN', 'Alamat tidak ditemukan.');
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          // CSRF guard on top of SameSite=Lax: state-changing calls must come from our own origin.
          const origin = req.headers.origin;
          if (origin && new URL(origin).host !== req.headers.host) throw new HttpError(403, 'ASAL_DITOLAK', 'Permintaan ditolak.');
        }
        const body = await readJson(req);
        const ctx = { req, res, url, query: url.searchParams, params: m.params, body, user: currentUser(req) };
        let out;
        for (const h of m.handlers) out = await h(ctx);
        if (res.headersSent) return;
        if (out && out.__raw !== undefined) send(req, res, 200, out.__raw, out.type);
        else send(req, res, 200, out ?? { ok: true });
      } catch (err) {
        if (res.headersSent) return;
        if (err instanceof HttpError) {
          if (err.extra?.retry_after) res.setHeader('Retry-After', String(err.extra.retry_after));
          send(req, res, err.status, { error: { code: err.code, message: err.message, ...(err.extra || {}) } });
        } else {
          console.error(JSON.stringify({ level: 'error', event: 'galat_server', path: url.pathname, message: err.message }));
          send(req, res, 500, { error: { code: 'GALAT_SERVER', message: 'Ada gangguan di server. Coba lagi sebentar lagi.' } });
        }
      } finally {
        // Structured log without personal content (PRD 12.6).
        if (process.env.LOG_REQUESTS !== '0' && process.env.NODE_ENV !== 'test') {
          console.log(JSON.stringify({ t: new Date().toISOString(), m: req.method, p: url.pathname.replace(/[0-9a-f-]{36}/g, ':id'), s: res.statusCode, ms: Date.now() - started }));
        }
      }
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405);
      res.end();
      return;
    }
    let path = url.pathname;
    if (path === '/') path = '/index.html';
    let f = files.get(path);
    // SPA fallback for app routes (no extension).
    if (!f && !extname(path)) f = files.get('/index.html');
    if (!f) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Tidak ditemukan');
      return;
    }
    res.setHeader('Content-Type', f.type);
    res.setHeader('ETag', f.etag);
    res.setHeader('Vary', 'Accept-Encoding');
    res.setHeader('Cache-Control', path === '/sw.js' || f.type.startsWith('text/html') ? 'no-cache' : 'public, max-age=0, must-revalidate');
    if (req.headers['if-none-match'] === f.etag) {
      res.writeHead(304);
      res.end();
      return;
    }
    const ae = req.headers['accept-encoding'] || '';
    let body = f.raw;
    if (f.br && ae.includes('br')) { body = f.br; res.setHeader('Content-Encoding', 'br'); } else if (f.gz && ae.includes('gzip')) { body = f.gz; res.setHeader('Content-Encoding', 'gzip'); }
    res.setHeader('Content-Length', body.length);
    res.writeHead(200);
    res.end(req.method === 'HEAD' ? undefined : body);
  }

  return { handle, files };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { handle } = await buildApp();
  const port = Number(process.env.PORT || 3000);
  createServer((req, res) => {
    handle(req, res).catch((e) => {
      console.error(e);
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
  }).listen(port, () => {
    console.log(`KAJAR berjalan di http://localhost:${port} (penyedia AI: ${process.env.LLM_PROVIDER || 'mock'})`);
  });
  setInterval(() => {
    try { checkOverdue(); } catch (e) { console.error(e.message); }
  }, 15 * 60_000).unref();
}
