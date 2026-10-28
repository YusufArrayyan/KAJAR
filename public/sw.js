// Service worker: app shell cache + offline practice reading (PRD F-LOW-1, F-LOW-3, S12).
// The VERSION placeholder is replaced by the server with a hash of public/ so every deploy refreshes the cache.
const VERSION = '__KAJAR_SW_VERSION__';
const SHELL = `kajar-shell-${VERSION}`;
const DATA = 'kajar-data';
const DATA_MAX_ENTRIES = 80; // keeps cached practice well under 2 MB
const PRECACHE = [
  '/index.html', '/offline.html', '/css/app.css', '/js/app.js', '/js/auth.js', '/js/student.js', '/js/idb.js',
  '/js/privacy.js', '/js/offline-page.js', '/logo.svg', '/manifest.webmanifest',
];
const CACHED_API = ['/api/me', '/api/home', '/api/topics', '/api/practice/next', '/api/assessments/awal', '/api/assessments/akhir'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('kajar-shell-') && k !== SHELL) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function trim(cache) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - DATA_MAX_ENTRIES; i++) await cache.delete(keys[i]);
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  if (url.pathname.startsWith('/api/')) {
    if (!CACHED_API.some((p) => url.pathname === p)) return;
    // Network first; fall back to the last copy when the signal drops.
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok) {
          const c = await caches.open(DATA);
          await c.put(req, res.clone());
          trim(c);
        }
        return res;
      } catch {
        const hit = await caches.match(req, { cacheName: DATA });
        if (hit) return hit;
        return new Response(JSON.stringify({ error: { code: 'OFFLINE', message: 'Sinyal hilang.' } }), { status: 503, headers: { 'Content-Type': 'application/json' } });
      }
    })());
    return;
  }

  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        return await fetch(req);
      } catch {
        return (await caches.match('/index.html', { cacheName: SHELL })) || caches.match('/offline.html', { cacheName: SHELL });
      }
    })());
    return;
  }

  // Static files: cache first (ETag-validated copies are refreshed on the next deploy via VERSION).
  e.respondWith((async () => {
    const hit = await caches.match(req, { cacheName: SHELL });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res.ok && (url.pathname.startsWith('/js/') || url.pathname.startsWith('/css/'))) {
        (await caches.open(SHELL)).put(req, res.clone());
      }
      return res;
    } catch {
      return new Response('', { status: 504 });
    }
  })());
});
