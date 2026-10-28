// Performance budget check against PRD 12.1 (sizes only; timing needs a real device on throttled 3G).
//   npm run budget
import { readFileSync } from 'node:fs';
import { brotliCompressSync, gzipSync, constants as zc } from 'node:zlib';

process.env.NODE_ENV = 'test';
process.env.DB_PATH = ':memory:';

const br = (b) => brotliCompressSync(b, { params: { [zc.BROTLI_PARAM_QUALITY]: 11 } }).length;
const gz = (b) => gzipSync(b, { level: 9 }).length;
const file = (p) => readFileSync(new URL(`../public${p}`, import.meta.url));
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

// What a signed-in student downloads on the first visit: page + scripts + the service-worker precache.
const pageLoad = ['/index.html', '/css/app.css', '/js/app.js', '/js/student.js', '/js/idb.js', '/js/privacy.js'];
const precacheOnly = ['/sw.js', '/js/auth.js', '/offline.html', '/js/offline-page.js', '/logo.svg', '/manifest.webmanifest'];
const sum = (list, f) => list.reduce((s, p) => s + f(file(p)), 0);

const rows = [];
const check = (name, value, limit, unit = 'bytes') => rows.push({ name, value, limit, ok: value <= limit, unit });

const page = sum(pageLoad, br);
const pre = sum(precacheOnly, br);
check('Muat pertama siswa (HTML+JS+CSS, brotli)', page, 120 * 1024);
check('Muat pertama + precache Service Worker (brotli)', page + pre, 120 * 1024);
check('Muat pertama dengan gzip saja', sum(pageLoad, gz) + sum(precacheOnly, gz), 120 * 1024);

// Chat exchange: request + response body, compressed the way the server sends it.
const { createServer } = await import('node:http');
const { buildApp } = await import('../server/index.js');
const { handle } = await buildApp({ dbPath: ':memory:' });
const server = createServer((req, res) => handle(req, res));
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;
let cookie = '';
const login = await fetch(`${base}/api/auth/student/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nickname: 'Rani', pin: '246810' }) });
cookie = login.headers.get('set-cookie').split(';')[0];
const sizes = [];
for (const text of ['Suku ke-3 barisan aritmetika 11 dan suku ke-7 23. Cara cari bedanya gimana?', '4', '23 - 11 = 4 x beda?', 'masih bingung']) {
  const body = JSON.stringify({ text, client_msg_id: crypto.randomUUID() });
  const res = await fetch(`${base}/api/chat/messages`, { method: 'POST', headers: { 'content-type': 'application/json', cookie, 'accept-encoding': 'br' }, body });
  const resBytes = Number(res.headers.get('content-length')) || (await res.arrayBuffer()).byteLength;
  // ~350 bytes of HTTP/2 headers per direction is a reasonable estimate with header compression.
  sizes.push(body.length + resBytes + 700);
}
server.close();
const avgChat = Math.round(sizes.reduce((a, b) => a + b, 0) / sizes.length);
check('Satu pertukaran chat (rata-rata, termasuk perkiraan header)', avgChat, 3 * 1024);
check('Sesi 15 menit: 20 pertanyaan + navigasi (perkiraan)', avgChat * 20 + 8 * 1024, 100 * 1024);

console.log('\nAnggaran performa KAJAR (PRD 12.1)\n');
for (const r of rows) console.log(`${r.ok ? 'LULUS' : 'GAGAL'}  ${r.name}: ${kb(r.value)} (batas ${kb(r.limit)})`);
console.log('\nRincian muat pertama (brotli):');
for (const p of [...pageLoad, ...precacheOnly]) console.log(`  ${p.padEnd(24)} ${kb(br(file(p))).padStart(9)}  (asli ${kb(file(p).length)})`);
console.log('\nBelum terukur di sini: waktu sampai bisa mengetik di 3G lambat, skor Lighthouse, dan muat berikutnya dari cache');
console.log('(cangkang dilayani Service Worker; yang diunduh ulang hanya data API). Ukur di ponsel Android entry-level.\n');
process.exit(rows.every((r) => r.ok) ? 0 : 1);
