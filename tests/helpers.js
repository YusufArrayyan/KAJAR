// Test harness: fresh in-memory database + an HTTP server on a random port.
import { createServer } from 'node:http';

process.env.NODE_ENV = 'test';
process.env.LLM_PROVIDER = 'mock';
process.env.DB_PATH = ':memory:';

export async function startApp() {
  const { closeDb } = await import('../server/db.js');
  closeDb();
  const { resetRateLimits } = await import('../server/http.js');
  resetRateLimits();
  const { resetHintState } = await import('../server/routes/student.js');
  resetHintState();
  const { buildApp } = await import('../server/index.js');
  const { handle } = await buildApp({ dbPath: ':memory:' });
  const server = createServer((req, res) => handle(req, res));
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, close: () => new Promise((r) => server.close(r)) };
}

// Minimal cookie-keeping client.
export function client(base) {
  let cookie = '';
  async function call(method, path, body) {
    const res = await fetch(base + path, {
      method,
      headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'manual',
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* csv or empty */ }
    return { status: res.status, body: json, text };
  }
  return {
    get: (p) => call('GET', p),
    post: (p, b = {}) => call('POST', p, b),
    put: (p, b = {}) => call('PUT', p, b),
  };
}

export const DEMO_PASSWORD = 'kajar-demo-2026';

export async function login(base, who) {
  const c = client(base);
  if (who === 'rani') await c.post('/api/auth/student/login', { nickname: 'Rani', pin: '246810' });
  else if (who === 'dimas') await c.post('/api/auth/student/login', { nickname: 'Dimas', pin: '135790' });
  else await c.post('/api/auth/staff/login', { email: `${who}@kajar.test`, password: DEMO_PASSWORD });
  return c;
}
