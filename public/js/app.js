// KAJAR client core: router, API, rendering helpers, shells. No dependencies, no bundler.

// ---------- Safe HTML templating ----------
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Raw(String(s));
const out = (v) => (v == null || v === false ? '' : v instanceof Raw ? v.s : Array.isArray(v) ? v.map(out).join('') : esc(v));
export function html(strings, ...vals) {
  let s = strings[0];
  vals.forEach((v, i) => { s += out(v) + strings[i + 1]; });
  return raw(s);
}

// ---------- Icons (inline SVG, 24px grid, decorative unless labelled) ----------
const P = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  book: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zm0 0v16M8 7h7',
  chat: 'M4 5h16v11H9l-5 4z',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-8 9a8 8 0 0 1 16 0',
  back: 'M15 5l-7 7 7 7',
  send: 'M4 12 20 4l-6 16-3-7z',
  alert: 'M12 3 2 20h20zM12 10v4m0 3v.01',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 11v6m0-10v.01',
  check: 'M5 12l5 5 9-10',
  wifi: 'M2 9a15 15 0 0 1 20 0M5 13a10 10 0 0 1 14 0M8.5 16.5a5 5 0 0 1 7 0M12 20v.01',
  inbox: 'M3 13h5l1 3h6l1-3h5M5 5h14l2 8v6H3v-6z',
  grad: 'M2 9l10-5 10 5-10 5zM6 11v5c3 2 9 2 12 0v-5',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 7v5l3 2',
  chart: 'M4 20V10m6 10V4m6 16v-7m4 7H2',
  shield: 'M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z',
  users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M16 3a4 4 0 0 1 0 8m2 10a7 7 0 0 0-3-5.7',
  file: 'M6 2h9l5 5v15H6zM14 2v6h6',
  bell: 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4',
  doc: 'M7 3h10v18H7zM10 7h4m-4 4h4m-4 4h2',
  cog: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12l2-1-2-4-2 1-2-1V5h-4v2l-2 1-2-1-2 4 2 1v2l-2 1 2 4 2-1 2 1v2h4v-2l2-1 2 1 2-4-2-1z',
  coin: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM15 9h-4a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4H9m3-12v2m0 10v2',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11',
  download: 'M12 3v12m-5-5 5 5 5-5M4 21h16',
  lock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4',
  hand: 'M12 3v8m-4-6v7m8-5v6M4 12v-1a2 2 0 0 1 4 0M6 13v2a7 7 0 0 0 14 0v-5a2 2 0 0 0-4 0',
};
export const icon = (name, label) => raw(
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${label ? `role="img" aria-label="${esc(label)}"` : 'aria-hidden="true" focusable="false"'}><path d="${P[name] || ''}"/></svg>`,
);
export const LOGO = raw('<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><path fill="#205FDF" d="M18 21h22c8 0 14 6 14 14v4c0 8-6 14-14 14H22l-9 7c-1 1-3 0-2-2l1-6c-4-3-6-7-6-12v-5c0-8 6-14 12-14z"/><rect x="13" y="27" width="31" height="19" rx="8" fill="#fff"/><path fill="none" stroke="#1C46B2" stroke-width="2.6" stroke-linecap="round" d="M19 39q3-5.5 6 0M31 39q3-5.5 6 0"/><path fill="#1C46B2" d="M31 6 6 15l12 4.2V25h26v-5.8L56 15z"/><path fill="none" stroke="#1C46B2" stroke-width="1.8" d="M54 15.6v8"/><rect x="52.2" y="22.5" width="3.6" height="5" rx="1.4" fill="#1C46B2"/><path fill="#F9B115" d="M37 43.5l7-3.5v11.5l7 7.5c.8.9 0 2.2-1.2 1.9L41 58l-4-4.5z"/><path fill="#3699FC" d="M46 47l12-7v6l-7 4 7 5v6z"/></svg>');

// ---------- Formatting (Intl, never hand-rolled) ----------
const dtf = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' });
const dtfFull = new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long' });
const tf = new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit' });
const nf = new Intl.NumberFormat('id-ID');
const rtf = new Intl.RelativeTimeFormat('id-ID', { numeric: 'auto' });
export const fmt = {
  date: (d) => dtf.format(new Date(d)),
  day: (d) => dtfFull.format(new Date(d)),
  time: (d) => tf.format(new Date(d)),
  num: (n) => (n == null ? '–' : nf.format(n)),
  ago(d) {
    const s = (new Date(d) - Date.now()) / 1000;
    const a = Math.abs(s);
    if (a < 3600) return rtf.format(Math.round(s / 60), 'minute');
    if (a < 86400) return rtf.format(Math.round(s / 3600), 'hour');
    return rtf.format(Math.round(s / 86400), 'day');
  },
  kb: (b) => `${nf.format(Math.max(1, Math.round(b / 1024)))} KB`,
};

// ---------- API ----------
export class ApiError extends Error {
  constructor(status, code, message, extra = {}) { super(message); Object.assign(this, { status, code, ...extra }); }
}
export async function api(path, { method = 'GET', body, raw: asText } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method, credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': typeof body === 'string' ? 'text/csv' : 'application/json' } : {},
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'OFFLINE', 'Sinyal hilang. Cek koneksi lalu coba lagi.', { offline: true });
  }
  if (asText && res.ok) return res.text();
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    const e = data?.error || {};
    if (res.status === 401 && state.me) { state.me = null; go(loginPath(), { replace: true }); }
    throw new ApiError(res.status, e.code || 'GALAT', e.message || 'Ada gangguan. Coba lagi sebentar lagi.', e);
  }
  return data;
}

// ---------- State & prefs ----------
export const state = { me: null, view: null, data: {} };
export const loginPath = () => (location.pathname.startsWith('/staf') || ['reviewer', 'teacher', 'coordinator', 'admin'].includes(state.lastRole) ? '/staf/masuk' : '/masuk');

export function applyPrefs(prefs = {}) {
  const root = document.documentElement;
  const tema = prefs.tema || localStorage.getItem('kajar-tema') || 'sistem';
  if (tema === 'sistem') root.removeAttribute('data-theme'); else root.dataset.theme = tema;
  root.dataset.size = prefs.ukuran || localStorage.getItem('kajar-ukuran') || 'normal';
  const hemat = prefs.hemat ?? (localStorage.getItem('kajar-hemat') !== '0');
  root.dataset.hemat = hemat ? '1' : '0';
  localStorage.setItem('kajar-tema', tema);
  localStorage.setItem('kajar-ukuran', root.dataset.size);
  localStorage.setItem('kajar-hemat', hemat ? '1' : '0');
}
export const hemat = () => document.documentElement.dataset.hemat !== '0';

// ---------- Data usage estimate (F-LOW-4): sums transferSize of every request, per ISO week ----------
function weekId(d = new Date()) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return `${t.getUTCFullYear()}-${Math.ceil(((t - y) / 864e5 + 1) / 7)}`;
}
export function dataUsage() {
  try {
    const u = JSON.parse(localStorage.getItem('kajar-data') || '{}');
    return u.week === weekId() ? u : { week: weekId(), bytes: 0, session: 0 };
  } catch { return { week: weekId(), bytes: 0 }; }
}
let sessionBytes = 0;
export const sessionUsage = () => sessionBytes;
function countBytes(entries) {
  let add = 0;
  for (const e of entries) add += e.transferSize || 0;
  if (!add) return;
  sessionBytes += add;
  const u = dataUsage();
  u.bytes += add;
  localStorage.setItem('kajar-data', JSON.stringify(u));
}
if ('PerformanceObserver' in window) {
  try {
    new PerformanceObserver((list) => countBytes(list.getEntries())).observe({ type: 'resource', buffered: true });
    new PerformanceObserver((list) => countBytes(list.getEntries())).observe({ type: 'navigation', buffered: true });
  } catch { /* unsupported entry types */ }
}

// ---------- Feedback helpers ----------
let toastTimer;
export function toast(msg) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    document.body.append(el);
  }
  el.textContent = msg;
  el.hidden = false;
  announce(msg);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 4000);
}
export function announce(msg) {
  const live = document.getElementById('live');
  live.textContent = '';
  setTimeout(() => { live.textContent = msg; }, 30);
}

export function confirmDialog({ title, body, confirm = 'Lanjutkan', cancel = 'Batal', danger = false }) {
  return new Promise((resolve) => {
    const d = document.createElement('dialog');
    d.setAttribute('aria-labelledby', 'dlg-title');
    d.innerHTML = String(html`<h2 id="dlg-title">${title}</h2><p class="muted">${body}</p>
      <div class="actions"><button class="btn secondary" value="no" type="button">${cancel}</button>
      <button class="btn ${danger ? 'danger' : ''}" value="yes" type="button">${confirm}</button></div>`);
    document.body.append(d);
    const done = (v) => { d.close(); d.remove(); resolve(v); };
    d.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b) done(b.value === 'yes');
      else if (e.target === d) done(false);
    });
    d.addEventListener('cancel', (e) => { e.preventDefault(); done(false); });
    d.showModal();
    d.querySelector('button[value="no"]').focus();
  });
}

export function fieldError(form, field, msg) {
  form.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
  form.querySelectorAll('.field-error').forEach((el) => { el.textContent = ''; el.hidden = true; });
  const input = field && form.querySelector(`[name="${field}"]`);
  const box = (field && form.querySelector(`#err-${field}`)) || form.querySelector('.form-error');
  if (input) {
    input.setAttribute('aria-invalid', 'true');
    input.focus();
  }
  if (box) { box.textContent = msg; box.hidden = false; }
  announce(msg);
}
export const clearErrors = (form) => fieldError(form, null, '');

export async function busy(btn, label, fn) {
  const prev = btn?.innerHTML;
  if (btn) { btn.disabled = true; btn.textContent = label; }
  try { return await fn(); } finally { if (btn && btn.isConnected) { btn.disabled = false; btn.innerHTML = prev; } }
}

// ---------- Common view fragments ----------
export const skeleton = (label = 'Memuat…') => html`<div class="skeleton" role="status"><p>${label}</p><div class="line"></div><div class="line"></div><div class="line"></div></div>`;
export const emptyState = (text, action) => html`<div class="empty"><p>${text}</p>${action || ''}</div>`;
export function errorBlock(err) {
  const msg = err?.offline ? 'Sinyal hilang. Data yang tersimpan tetap bisa dibaca. Coba sambung lagi.' : err?.message || 'Ada gangguan. Coba lagi.';
  return html`<div class="banner danger" role="alert">${icon(err?.offline ? 'wifi' : 'alert')}<div class="stack-sm"><p>${msg}</p>
    <button class="btn small secondary" type="button" data-action="reload">Coba lagi</button></div></div>`;
}
export const banner = (kind, text, extra) => html`<div class="banner ${kind}">${icon(kind === 'danger' || kind === 'warn' ? 'alert' : kind === 'ok' ? 'check' : 'info')}<div class="stack-sm"><p>${text}</p>${extra || ''}</div></div>`;

// ---------- Router ----------
const routes = [];
export function route(pattern, handler, opts = {}) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '/?$');
  routes.push({ re, keys, handler, opts });
}
export function go(path, { replace = false } = {}) {
  if (path === location.pathname + location.search && !replace) return render();
  history[replace ? 'replaceState' : 'pushState']({}, '', path);
  return render();
}
let renderSeq = 0;
export async function render() {
  const seq = ++renderSeq;
  const app = document.getElementById('app');
  const path = location.pathname;
  const match = routes.map((r) => ({ r, m: r.re.exec(path) })).find((x) => x.m);
  if (!match) return go(homePath(), { replace: true });
  const params = {};
  match.r.keys.forEach((k, i) => { params[k] = decodeURIComponent(match.m[i + 1]); });
  const query = new URLSearchParams(location.search);
  if (state.view?.leave) state.view.leave();
  state.view = null;
  let view;
  try {
    const pending = match.r.handler({ params, query, path });
    // Show a text skeleton only if loading takes a moment.
    const t = setTimeout(() => { if (seq === renderSeq && match.r.opts.shell) app.innerHTML = String(match.r.opts.shell(skeleton())); }, 150);
    view = await pending;
    clearTimeout(t);
  } catch (err) {
    if (seq !== renderSeq) return undefined;
    view = { title: 'Ada gangguan', body: errorBlock(err) };
    if (match.r.opts.shell) view.body = match.r.opts.shell(view.body);
  }
  if (seq !== renderSeq || !view) return undefined;
  if (view.redirect) return go(view.redirect, { replace: true });
  state.view = view;
  document.title = `${view.title ? `${view.title} · ` : ''}KAJAR`;
  app.innerHTML = String(view.body);
  applyBars(app);
  if (view.mount) view.mount(app);
  if (!view.keepScroll) window.scrollTo(0, 0);
  const h1 = app.querySelector('h1');
  if (h1 && renderSeq > 1 && !view.noFocus) { h1.tabIndex = -1; h1.focus({ preventScroll: true }); }
  return undefined;
}
export const rerender = () => render();

// Width/height from data attributes (CSP forbids inline style attributes).
export function applyBars(root) {
  root.querySelectorAll('[data-w]').forEach((el) => { el.style.width = `${el.dataset.w}%`; });
}

let homeResolver = () => '/masuk';
export const setHome = (fn) => { homeResolver = fn; };
export const homePath = () => homeResolver();

// ---------- Global delegation ----------
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href]');
  if (a && a.origin === location.origin && !a.target && !a.hasAttribute('download') && !e.metaKey && !e.ctrlKey && !e.shiftKey && e.button === 0 && !a.pathname.startsWith('/api/')) {
    e.preventDefault();
    go(a.pathname + a.search + a.hash);
    return;
  }
  const act = e.target.closest('[data-action]');
  if (!act) return;
  if (act.dataset.action === 'reload') { render(); return; }
  if (act.dataset.action === 'logout') { logout(); return; }
  const fn = state.view?.actions?.[act.dataset.action];
  if (fn) { e.preventDefault(); fn(act, e); }
});
document.addEventListener('submit', (e) => {
  const form = e.target.closest('form[data-form]');
  if (!form) return;
  e.preventDefault();
  const fn = state.view?.forms?.[form.dataset.form];
  if (fn) fn(form, Object.fromEntries(new FormData(form)), e.submitter);
});
document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-change]');
  const fn = el && state.view?.changes?.[el.dataset.change];
  if (fn) fn(el, e);
});
window.addEventListener('popstate', () => render());

// ---------- Offline banner ----------
function syncOnline() { document.getElementById('offline').hidden = navigator.onLine; }
window.addEventListener('online', () => { syncOnline(); toast('Sinyal kembali.'); window.dispatchEvent(new Event('kajar:online')); });
window.addEventListener('offline', syncOnline);

// ---------- Shells ----------
export function studentShell(active, content, { notes = 0 } = {}) {
  const tabs = [['/beranda', 'home', 'Beranda'], ['/latihan', 'book', 'Latihan'], ['/tanya', 'chat', 'Tanya'], ['/profil', 'user', 'Profil']];
  return html`<main class="wrap" id="isi">${content}</main>
  <nav class="tabbar" aria-label="Menu utama"><ul>${tabs.map(([href, ic, label]) => html`<li><a class="tab" href="${href}" ${active === href ? raw('aria-current="page"') : ''}>
    <span class="dot">${icon(ic)}${href === '/beranda' && notes ? raw('<span class="badge-dot"></span><span class="sr-only">(ada catatan baru)</span>') : ''}</span>${label}</a></li>`)}</ul></nav>`;
}

export function staffShell(nav, active, content, { title = 'KAJAR', unread = 0 } = {}) {
  const me = state.me;
  return html`<div class="shell"><aside class="side no-print">
    <div class="head"><a class="brand" href="${nav[0][0]}">${LOGO}<span translate="no">KAJAR</span></a>
      <a class="btn ghost small icon-btn" href="${nav[0][0].split('/').slice(0, 2).join('/')}/notifikasi" aria-label="Notifikasi${unread ? `, ${unread} belum dibaca` : ''}"><span class="dot">${icon('bell')}${unread ? raw('<span class="badge-dot"></span>') : ''}</span></a></div>
    <nav class="nav" aria-label="${title}">${nav.map(([href, ic, label]) => html`<a href="${href}" ${active === href ? raw('aria-current="page"') : ''}>${icon(ic)}${label}</a>`)}</nav>
    <div class="foot stack-sm"><p class="caption truncate">${me?.name} · ${roleLabel(me?.role)}</p>
      <button class="btn ghost small" type="button" data-action="logout">${icon('logout')}Keluar</button></div>
  </aside><main class="main" id="isi">${content}</main></div>`;
}

export const roleLabel = (r) => ({ student: 'Siswa', reviewer: 'Peninjau', teacher: 'Guru', coordinator: 'Koordinator', admin: 'Admin' }[r] || '');

export async function logout() {
  try { await api('/api/auth/logout', { method: 'POST' }); } catch { /* offline logout still clears the client */ }
  const wasStaff = state.me && state.me.role !== 'student';
  state.me = null;
  location.href = wasStaff ? '/staf/masuk' : '/masuk';
}

// ---------- Boot ----------
async function boot() {
  syncOnline();
  applyPrefs();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  let me = null;
  try {
    me = (await api('/api/me')).me;
    localStorage.setItem('kajar-me', JSON.stringify(me));
  } catch (err) {
    // Offline start: reuse the last known profile so cached screens still open.
    if (err.offline) me = JSON.parse(localStorage.getItem('kajar-me') || 'null');
  }
  state.me = me;
  if (me) {
    state.lastRole = me.role;
    applyPrefs(me.prefs);
  }
  const mod = !me ? 'auth' : me.role === 'student' ? 'student' : me.role === 'reviewer' ? 'review' : me.role === 'admin' ? 'admin' : 'staff';
  const m = await import(`/js/${mod}.js`);
  m.default();
  render();
}
boot();
