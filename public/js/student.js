// Student screens S2–S12 (PRD 8.1).
import {
  html, raw, api, route, go, setHome, state, icon, fmt, toast, announce, confirmDialog, fieldError, clearErrors, busy,
  studentShell, skeleton, emptyState, errorBlock, banner, applyPrefs, hemat, dataUsage, sessionUsage, logout, esc, LOGO, currentTheme,
} from './app.js';
import { outbox, convs, clearLocal } from './idb.js';
import { privacyPoints, privacyBody } from './privacy.js';

const MASTERY = { belum: ['Belum', 0], mulai: ['Mulai', 1], cukup: ['Cukup', 2], kuat: ['Kuat', 3] };
const LABEL_AI = 'Jawaban AI';
const WARN_AI = 'Bisa salah, cek lagi kalau ragu.';
const RETRACTED = 'Jawaban ini ditarik karena kurang tepat. Kakak peninjau sedang menyiapkan penjelasan yang benar.';

const shell = (active, content) => studentShell(active, content, { notes: state.me?.notes_new || 0 });
const back = (href, label) => html`<a class="back" href="${href}" aria-label="${label}">${icon('back')}</a>`;

async function refreshMe() {
  try {
    state.me = (await api('/api/me')).me;
    localStorage.setItem('kajar-me', JSON.stringify(state.me));
  } catch { /* keep cached profile offline */ }
  return state.me;
}

// Topic tiles: a short math glyph on a tinted square; the topic name is always printed next to it.
const TOPIC_TILE = {
  eksponen: ['aⁿ', 't1'], logaritma: ['log', 't2'], 'barisan-aritmetika': ['+b', 't3'], 'barisan-geometri': ['×r', 't4'],
  deret: ['Σ', 't5'], spltv: ['xyz', 't6'], 'fungsi-kuadrat': ['x²', 't7'], trigonometri: ['sin', 't8'], statistika: ['x̄', 't9'],
};
const topicTile = (slug) => {
  const [g, tone] = TOPIC_TILE[slug] || ['∑', 't1'];
  return html`<span class="tile ${tone}" aria-hidden="true">${g}</span>`;
};
const LOGO_SMALL = html`<span class="logo-chip">${LOGO}</span>`;

// Compact mastery: four segments plus the level as text (never colour alone).
function mastery(level) {
  const [label, n] = MASTERY[level] || MASTERY.belum;
  return html`<span class="mastery lv-${level}"><span class="meter" aria-hidden="true">${[0, 1, 2, 3].map((i) => html`<span class="${i <= n && level !== 'belum' ? 'on' : ''}"></span>`)}</span><span><span class="sr-only">Penguasaan: </span>${label}</span></span>`;
}

function topicRow(t, withSize = false) {
  const left = t.remaining ? `${t.remaining} soal lagi` : 'Semua soal selesai';
  return html`<li><a class="topic-row" href="/latihan/${t.slug}">${topicTile(t.slug)}<span class="grow"><strong>${t.name}</strong>
    <span class="sub">${mastery(t.mastery)}<span class="caption num">${left}${withSize ? ` · ±${t.size_kb} KB` : ''}</span></span></span><span class="go">${icon('back')}</span></a></li>`;
}

// ---------------------------------------------------------------- Outbox (F-LOW-2)
const chat = { convId: null, messages: [], pending: [], more: false, remaining: null, limitHit: false, sending: false, lastError: null };
let flushing = false;
let backoff = 2000;
let retryTimer;

async function loadPending() {
  const all = await outbox.all();
  chat.pending = all.filter((p) => (p.conversation_id || null) === chat.convId);
}

export async function flushOutbox() {
  if (flushing || !navigator.onLine) return;
  flushing = true;
  clearTimeout(retryTimer);
  try {
    for (const item of await outbox.all()) {
      if (item.status === 'gagal') continue;
      await outbox.put({ ...item, status: 'mengirim' });
      refreshPendingUi();
      try {
        const r = await api('/api/chat/messages', { method: 'POST', body: { text: item.text, client_msg_id: item.client_msg_id, conversation_id: item.conversation_id || undefined } });
        await outbox.del(item.client_msg_id);
        backoff = 2000;
        onDelivered(item, r);
      } catch (err) {
        if (err.offline) {
          await outbox.put({ ...item, status: 'antre' });
          refreshPendingUi();
          break;
        }
        if (err.code === 'TERLALU_CEPAT') {
          await outbox.put({ ...item, status: 'antre' });
          refreshPendingUi();
          retryTimer = setTimeout(flushOutbox, (err.retry_after || 10) * 1000);
          break;
        }
        if (err.code === 'BATAS_HARIAN') chat.limitHit = true;
        if (err.code === 'MENUNGGU_PERSETUJUAN') { await outbox.del(item.client_msg_id); toast(err.message); continue; }
        await outbox.put({ ...item, status: 'gagal', error: err.message });
        chat.lastError = err.message;
        refreshPendingUi();
        if (err.status >= 500) {
          retryTimer = setTimeout(flushOutbox, backoff);
          backoff = Math.min(backoff * 2, 60000);
        }
      }
    }
  } finally {
    flushing = false;
    refreshPendingUi();
  }
}
window.addEventListener('kajar:online', flushOutbox);

function onDelivered(item, r) {
  if (typeof r.remaining === 'number') { chat.remaining = r.remaining; if (state.me) state.me.remaining = r.remaining; }
  const isHere = location.pathname.startsWith('/tanya') && ((item.conversation_id || null) === chat.convId);
  if (!isHere) {
    if (r.ai) toast('Pesanmu sudah terkirim dan dijawab. Buka Riwayat untuk melihatnya.');
    return;
  }
  if (!chat.convId) {
    chat.convId = r.conversation_id;
    history.replaceState({}, '', `/tanya/${r.conversation_id}`);
    // Re-home queued messages typed in the same new conversation.
    outbox.all().then((items) => items.filter((x) => !x.conversation_id).forEach((x) => outbox.put({ ...x, conversation_id: r.conversation_id })));
  }
  chat.messages.push(r.student, r.ai);
  convs.put({ id: chat.convId, title: chat.messages.find((m) => m.role === 'student')?.text.slice(0, 60), topic: r.ai?.topic, updated_at: new Date().toISOString(), messages: chat.messages });
  announce(r.ai?.status === 'dicabut' ? RETRACTED : `${LABEL_AI}: ${r.ai?.text || ''}`);
}

async function refreshPendingUi() {
  const list = document.getElementById('chat-list');
  if (!list || !location.pathname.startsWith('/tanya')) return;
  await loadPending();
  chat.sending = chat.pending.some((p) => p.status === 'mengirim');
  list.innerHTML = String(chatItems());
  const note = document.getElementById('remaining');
  if (note && chat.remaining !== null) note.textContent = `Sisa ${chat.remaining} pertanyaan hari ini`;
  if (chat.limitHit || chat.remaining === 0) showLimit();
  scrollChat();
}

// Scroll to the very bottom: the page padding keeps the newest message above the fixed composer.
// (scrollIntoView on the end marker left the last bubble hidden behind the composer.)
function scrollChat() {
  if (!document.getElementById('chat-end')) return;
  window.scrollTo({ top: document.documentElement.scrollHeight, behavior: hemat() ? 'auto' : 'smooth' });
}

function showLimit() {
  const c = document.getElementById('composer-inner');
  if (c) c.innerHTML = String(html`<div class="banner warn">${icon('clock')}<div class="stack-sm"><p>Pertanyaan hari ini sudah habis. Besok lanjut ya. Sementara itu coba Latihan.</p><a class="btn small" href="/latihan">Buka Latihan</a></div></div>`);
}

// ---------------------------------------------------------------- Chat rendering
function bubble(m) {
  if (m.role === 'student') {
    return html`<div class="bubble student"><p class="msg">${m.text}</p></div>`;
  }
  if (m.role === 'reviewer') {
    return html`<div class="bubble reviewer"><div class="meta"><span class="who">Catatan dari Kak ${m.author || 'Peninjau'}</span><span class="chip review">Manusia</span></div><p class="msg">${m.text}</p></div>`;
  }
  if (m.role === 'system') return html`<div class="bubble system"><p class="msg">${m.text}</p></div>`;
  if (m.status === 'dicabut') {
    return html`<div class="bubble ai retracted"><div class="meta"><span class="who">${LABEL_AI}</span><span class="chip danger">Ditarik</span></div><p>${RETRACTED}</p></div>`;
  }
  const fb = m.feedback;
  return html`<div class="bubble ai" data-id="${m.id}">
    <div class="meta"><span class="who">${LABEL_AI}</span>${m.topic ? html`<span class="chip topic">${m.topic}</span>` : ''}</div><p class="msg">${m.text}</p>
    ${m.hint_level ? html`<div class="meta hint-meta"><span class="chip hint">Petunjuk ${m.hint_level} dari 4</span></div>` : ''}
    <p class="warn-line">${WARN_AI}</p>
    <div class="feedback" role="group" aria-label="Umpan balik untuk jawaban ini">
      <button class="btn secondary" type="button" data-action="fb" data-kind="membantu" aria-pressed="${fb === 'membantu'}">Membantu</button>
      <button class="btn secondary" type="button" data-action="fb" data-kind="bingung" aria-pressed="${fb === 'bingung'}">Membingungkan</button>
      <button class="btn secondary" type="button" data-action="fb" data-kind="salah" aria-pressed="${fb === 'salah'}">Salah</button>
      <button class="btn ghost" type="button" data-action="human">${icon('hand')}Tanya Kakak Mahasiswa</button>
    </div></div>`;
}

function pendingBubble(p) {
  const status = p.status === 'gagal'
    ? html`<span>Belum terkirim</span> · <button class="linkish" type="button" data-action="retry" data-id="${p.client_msg_id}">Coba lagi</button>`
    : p.status === 'mengirim' ? html`<span>Mengirim…</span>` : html`<span>${icon('wifi')} Menunggu sinyal</span>`;
  return html`<div class="bubble student"><p class="msg">${p.text}</p><div class="status">${status}</div>${p.status === 'gagal' && p.error ? html`<div class="status">${p.error}</div>` : ''}</div>`;
}

function chatItems() {
  const items = chat.messages.map(bubble);
  const pend = chat.pending.map(pendingBubble);
  const thinking = chat.pending.some((p) => p.status === 'mengirim') ? html`<p class="thinking" role="status">KAJAR sedang berpikir…</p>` : '';
  if (!items.length && !pend.length) {
    return html`<div class="card flat stack-sm"><h2>Mau tanya apa?</h2><p class="muted">Tulis soal atau bagian yang membuatmu bingung. KAJAR akan membantu langkah demi langkah, bukan langsung memberi jawaban.</p>
      <p class="caption">Contoh: “Suku ke-3 barisan aritmetika 11 dan suku ke-7 23. Cara cari bedanya gimana?”</p></div>`;
  }
  return html`${chat.more ? html`<button class="btn ghost small" type="button" data-action="older">Muat pesan sebelumnya</button>` : ''}${items}${pend}${thinking}`;
}

// ---------------------------------------------------------------- Routes
export default function register() {
  setHome(() => (state.me && !state.me.onboarded ? '/mulai' : '/beranda'));
  flushOutbox();

  route('/', () => ({ redirect: state.me.onboarded ? '/beranda' : '/mulai' }));

  // S2 penjelasan data + persetujuan
  route('/mulai', () => ({
    title: 'Sebelum mulai',
    body: html`<main class="wrap no-tabs stack" id="isi"><h1>Sebelum mulai, baca ini ya</h1>
      <div class="card">${privacyPoints}</div>
      <button class="btn block" type="button" data-action="ok">Mengerti, lanjut</button>
      <p class="caption"><a href="/privasi">Baca selengkapnya</a></p></main>`,
    actions: {
      async ok(btn) {
        await busy(btn, 'Menyimpan…', async () => {
          try {
            await api('/api/me/onboarded', { method: 'POST' });
            state.me.onboarded = true;
            go(state.me.pretest_done ? '/beranda' : '/tes/awal');
          } catch (err) { toast(err.message); }
        });
      },
    },
  }));

  route('/privasi', () => ({ title: 'Penjelasan data', body: html`<main class="wrap no-tabs stack" id="isi">${privacyBody(true)}</main>` }));

  // S4 Beranda
  route('/beranda', async () => {
    let d;
    try { d = await api('/api/home'); state.me = d.me; } catch (err) { if (!err.offline) throw err; d = { me: state.me, continue: null, notes: [], topics: [], recommended: [], offline: true }; }
    const me = d.me;
    if (!me.onboarded) return { redirect: '/mulai' };
    const c = d.continue;
    const total = d.topics.length || 9;
    const mastered = d.topics.filter((t) => t.mastery === 'cukup' || t.mastery === 'kuat').length;
    const rec = d.topics.filter((t) => d.recommended.includes(t.slug) && t.slug !== c?.slug).slice(0, 3);
    const menu = [
      me.pretest_done ? ['/tes/awal/hasil', 'chart', 'Hasil tes', 't3'] : ['/tes/awal', 'grad', 'Tes Awal', 't3'],
      ['/latihan', 'book', 'Latihan', 't1'],
      ['/tanya', 'chat', 'Tanya', 't7'],
      ['/riwayat', 'list', 'Riwayat', 't4'],
    ];
    return {
      title: 'Beranda',
      body: shell('/beranda', html`<div class="stack">
        <header class="hero">
          <div class="row between"><span class="brand on-hero">${LOGO_SMALL}<span translate="no">KAJAR</span></span>
            <a class="hero-link" href="/profil">${icon(hemat() ? 'check' : 'info')}Hemat data ${hemat() ? 'aktif' : 'mati'}</a></div>
          <h1>Halo, ${me.name}!</h1>
          <p>Kelas ${me.class_name || '–'}. Mau belajar apa hari ini?</p>
          <div class="hero-progress">
            <div class="row between"><span>Topik yang sudah kamu kuasai</span><strong class="num">${mastered} dari ${total}</strong></div>
            <div class="bar" role="progressbar" aria-label="Topik dikuasai" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${mastered}"><span data-w="${Math.round((mastered / total) * 100)}"></span></div>
          </div>
        </header>
        <nav class="quick" aria-label="Menu cepat">${menu.map(([href, ic, label, tone]) => html`<a href="${href}"><span class="qi ${tone}">${icon(ic)}</span>${label}</a>`)}</nav>
        ${d.offline ? banner('info', 'Kamu sedang offline. Latihan yang pernah dibuka tetap bisa dibaca.') : ''}
        ${!me.pretest_done ? html`<section class="card promo" aria-labelledby="pre-h"><span class="qi t9">${icon('grad')}</span><div class="stack-sm grow">
          <h2 id="pre-h">Mulai dengan Tes Awal</h2><p class="muted">15 soal, sekitar 15 menit. Ini bukan nilai sekolah; KAJAR jadi tahu harus mulai dari mana.</p>
          <a class="btn" href="/tes/awal">Mulai Tes Awal</a></div></section>` : ''}
        ${me.posttest_open && !me.posttest_done && me.pretest_done ? html`<section class="card promo"><span class="qi t1">${icon('grad')}</span><div class="stack-sm grow"><h2>Tes Akhir sudah dibuka</h2>
          <p class="muted">15 soal, mirip Tes Awal. Hasilnya membantu gurumu menilai apakah program ini berguna.</p><a class="btn" href="/tes/akhir">Mulai Tes Akhir</a></div></section>` : ''}
        ${c ? html`<section class="stack-sm" aria-labelledby="cont-h"><h2 id="cont-h" class="section-title">Lanjutkan belajar</h2>
          <a class="card card-link continue" href="/latihan/${c.slug}">${topicTile(c.slug)}<span class="grow"><strong>${c.name}</strong>
            <span class="caption">${c.remaining ? `${c.remaining} soal lagi` : 'Semua soal selesai'}</span>${mastery(c.mastery)}</span><span class="go">${icon('back')}</span></a></section>` : ''}
        ${me.consent?.complete ? html`<a class="card card-link ask" href="/tanya"><span class="qi t7">${icon('chat')}</span><span class="grow"><strong>Ada soal yang bikin bingung?</strong>
            <span class="caption">Tanya KAJAR, dibantu langkah demi langkah. Sisa ${me.remaining ?? '–'} pertanyaan hari ini.</span></span><span class="go">${icon('back')}</span></a>`
          : html`<div class="card flat"><p>Kelasmu belum selesai disiapkan. Latihan sudah bisa dipakai. Tanya Bebas akan aktif setelah gurumu menyelesaikan persetujuan.</p></div>`}
        ${rec.length ? html`<section class="stack-sm" aria-labelledby="rec-h"><div class="row between"><h2 id="rec-h" class="section-title">Disarankan untukmu</h2><a href="/latihan" class="more">Semua topik</a></div>
          <ul class="card topic-list" role="list">${rec.map((t) => topicRow(t))}</ul></section>` : ''}
        ${d.notes.length ? html`<section class="stack-sm" aria-labelledby="notes-h"><h2 id="notes-h" class="section-title">Catatan dari Kakak <span class="count">${d.notes.length} baru</span></h2>
          <ul class="card topic-list" role="list">${d.notes.map((n) => html`<li><a class="topic-row" href="/tanya/${n.conversation_id}"><span class="qi small t3">${icon(n.author ? 'hand' : 'info')}</span>
          <span class="grow"><strong>${n.author ? `Kak ${n.author}` : 'Pemberitahuan'}</strong><span class="caption break">${n.preview}</span></span><span class="go">${icon('back')}</span></a></li>`)}</ul></section>` : ''}
      </div>`),
    };
  }, { shell: (b) => shell('/beranda', b) });

  // S5 Daftar topik latihan
  route('/latihan', async () => {
    const d = await api('/api/topics');
    const rec = d.topics.filter((t) => d.recommended.includes(t.slug));
    const rest = d.topics.filter((t) => !d.recommended.includes(t.slug));
    return {
      title: 'Latihan',
      body: shell('/latihan', html`<div class="stack"><header class="page-head"><h1>Latihan</h1><p class="muted">Matematika kelas X. Coba dulu, minta petunjuk kalau buntu.</p></header>
        ${rec.length ? html`<section class="stack-sm" aria-labelledby="rec-h"><h2 id="rec-h" class="section-title">Disarankan untukmu <span class="count">dari Tes Awal</span></h2><ul class="card topic-list" role="list">${rec.map((t) => topicRow(t, true))}</ul></section>` : ''}
        <section class="stack-sm" aria-labelledby="all-h"><h2 id="all-h" class="section-title">${rec.length ? 'Topik lainnya' : 'Semua topik'}</h2><ul class="card topic-list" role="list">${(rec.length ? rest : d.topics).map((t) => topicRow(t, true))}</ul></section>
        <details class="card"><summary><strong>Cara menghitung tingkat penguasaan</strong></summary><p class="muted">${d.rule}</p></details>
      </div>`),
    };
  }, { shell: (b) => shell('/latihan', b) });

  // S6 Soal latihan
  route('/latihan/:slug', async ({ params, query }) => {
    const skip = query.get('lewati');
    const d = await api(`/api/practice/next?topic=${encodeURIComponent(params.slug)}${skip ? `&skip=${encodeURIComponent(skip)}` : ''}`);
    const q = d.question;
    const head = html`<div class="topbar">${back('/latihan', 'Kembali ke daftar topik')}<h1 class="grow truncate">${d.topic.name}</h1>${q ? html`<span class="caption num" aria-label="Soal ${d.position} dari ${d.total}">${d.position}/${d.total}</span>` : ''}</div>`;
    if (!q) return { title: d.topic.name, body: shell('/latihan', html`${head}${emptyState('Belum ada soal terbit untuk topik ini.', html`<a class="btn" href="/latihan">Pilih topik lain</a>`)}`) };
    const local = { q, solved: false, tried: false };
    const hintsHtml = (hints) => html`${hints.map((h) => html`<div class="hint-box"><span class="chip hint">Petunjuk ${h.level} dari 4</span><p>${h.text}</p></div>`)}`;
    const fullBtn = (can) => html`<button class="btn ghost" type="button" data-action="full" ${can ? '' : raw('aria-disabled="true"')} aria-describedby="full-help">Lihat langkah lengkap</button>
      <p class="help" id="full-help">${can ? 'Langkah lengkap sudah bisa dibuka.' : 'Bisa dibuka setelah kamu mencoba sekali atau memakai dua petunjuk.'}</p>`;
    return {
      title: `Latihan ${d.topic.name}`,
      body: shell('/latihan', html`<div class="stack">${head}
        ${d.all_solved ? banner('ok', 'Semua soal topik ini sudah kamu selesaikan. Kamu bisa mengulang untuk berlatih.') : ''}
        <section class="card stack" aria-labelledby="soal-h"><h2 id="soal-h" class="caption">Soal</h2><p class="question">${q.stem}</p></section>
        <form data-form="check" class="stack" novalidate>
          <div class="field"><label for="answer">Jawabanmu</label>
            <input id="answer" name="answer" type="text" inputmode="text" autocomplete="off" spellcheck="false" maxlength="60" aria-describedby="ans-help">
            <p class="help" id="ans-help">Tulis angkanya saja, misalnya 32, -3, atau 3/5.</p><p class="field-error" id="err-answer" role="alert" hidden></p></div>
          <div class="actions"><button class="btn" type="submit">Periksa</button><button class="btn secondary" type="button" data-action="hint">Minta petunjuk</button></div>
        </form>
        <div id="result" aria-live="polite"></div>
        <div id="hints" class="stack-sm">${hintsHtml(q.hints)}</div>
        <div id="full" class="stack-sm">${fullBtn(q.can_full)}</div>
      </div>`),
      actions: {
        async hint(btn) {
          if (q.hint_level >= 3) { toast('Petunjuk 4 adalah langkah lengkap. Tekan “Lihat langkah lengkap”.'); return; }
          await busy(btn, 'Memuat…', async () => {
            try {
              const r = await api(`/api/practice/${q.id}/hint`, { method: 'POST' });
              Object.assign(q, r);
              document.getElementById('hints').innerHTML = String(hintsHtml(r.hints));
              document.getElementById('full').innerHTML = String(fullBtn(r.can_full));
              announce(`Petunjuk ${r.hint_level} dari 4: ${r.hints[r.hints.length - 1]?.text}`);
            } catch (err) { toast(err.message); }
          });
        },
        async full(btn) {
          if (btn.getAttribute('aria-disabled') === 'true') { toast('Coba jawab dulu sekali, atau minta dua petunjuk.'); return; }
          await busy(btn, 'Memuat…', async () => {
            try {
              const r = await api(`/api/practice/${q.id}/solution`, { method: 'POST' });
              document.getElementById('full').innerHTML = String(html`<div class="hint-box"><span class="chip hint">Petunjuk 4 dari 4 · Langkah lengkap</span>
                <ol class="steps">${r.steps.map((s) => html`<li>${s.text}</li>`)}</ol></div>
                <div class="card flat stack-sm"><p>Mau ulangi dengan soal serupa?</p><div class="actions"><a class="btn" href="/latihan/${params.slug}?lewati=${q.id}">Soal serupa</a><a class="btn secondary" href="/latihan">Pilih topik lain</a></div></div>`);
              announce('Langkah lengkap ditampilkan.');
            } catch (err) { toast(err.message); }
          });
        },
      },
      forms: {
        async check(form, data, btn) {
          clearErrors(form);
          if (!data.answer.trim()) return fieldError(form, 'answer', 'Tulis jawabanmu dulu, ya.');
          await busy(btn, 'Memeriksa…', async () => {
            try {
              const r = await api(`/api/practice/${q.id}/attempt`, { method: 'POST', body: { answer: data.answer } });
              local.tried = true;
              q.can_full = true;
              const res = document.getElementById('result');
              if (r.correct) {
                res.innerHTML = String(html`${banner('ok', r.feedback)}<div class="actions"><a class="btn" href="/latihan/${params.slug}?lewati=${q.id}">Soal berikutnya</a>
                  <a class="btn secondary" href="/latihan">Pilih topik lain</a></div>`);
                form.querySelector('[type=submit]').disabled = true;
              } else {
                res.innerHTML = String(banner('warn', r.feedback));
                document.getElementById('full').innerHTML = String(fullBtn(true));
              }
            } catch (err) {
              fieldError(form, 'answer', err.offline ? 'Sinyal hilang. Jawabanmu belum terperiksa. Coba lagi saat ada sinyal.' : err.message);
            }
          });
          return undefined;
        },
      },
    };
  }, { shell: (b) => shell('/latihan', b) });

  // S7 Tanya Bebas
  const chatRoute = async ({ params }) => {
    const me = state.me;
    chat.convId = params.id || null;
    chat.messages = [];
    chat.more = false;
    chat.limitHit = false;
    chat.remaining = me.remaining ?? null;
    let offlineNote = false;
    if (chat.convId) {
      try {
        const d = await api(`/api/chat/conversations/${chat.convId}`);
        chat.messages = d.messages;
        chat.more = d.more;
        convs.put({ id: chat.convId, title: d.conversation.title, topic: d.conversation.topic, updated_at: d.messages.at(-1)?.created_at, messages: d.messages });
        if (state.me.notes_new) refreshMe();
      } catch (err) {
        if (!err.offline) throw err;
        const local = await convs.get(chat.convId);
        if (!local) throw err;
        chat.messages = local.messages;
        offlineNote = true;
      }
    }
    await loadPending();
    if (!me.consent?.complete) {
      return {
        title: 'Tanya KAJAR',
        body: shell('/tanya', html`<div class="stack"><h1>Tanya KAJAR</h1><div class="card stack-sm"><h2>Menunggu persetujuan</h2>
          <p>Kelasmu belum selesai disiapkan. Latihan sudah bisa dipakai. Tanya Bebas akan aktif setelah gurumu menyelesaikan persetujuan.</p>
          <a class="btn" href="/latihan">Buka Latihan</a></div></div>`),
      };
    }
    const draftKey = `kajar-draft:${chat.convId || 'baru'}`;
    return {
      title: 'Tanya KAJAR',
      keepScroll: true,
      body: html`<div class="chat-page">${shell('/tanya', html`<div class="topbar">${back('/riwayat', 'Lihat riwayat percakapan')}<h1 class="grow">Tanya KAJAR</h1>
        ${chat.convId ? html`<a class="btn ghost small" href="/tanya">Percakapan baru</a>` : ''}</div>
        ${offlineNote ? banner('info', 'Menampilkan salinan di ponsel. Pesan baru akan dikirim saat sinyal kembali.') : ''}
        <div id="chat-list" class="chat" aria-live="off">${chatItems()}</div><div id="chat-end"></div>`)}
        <div class="composer"><div class="inner" id="composer-inner">
          <p class="note"><span>AI bisa salah. Cek lagi bersama guru kalau ragu.</span><span id="remaining" class="num">${chat.remaining !== null ? `Sisa ${chat.remaining} pertanyaan hari ini` : ''}</span></p>
          <form data-form="send" novalidate><label class="sr-only" for="msg">Tulis pertanyaanmu</label>
            <textarea id="msg" name="text" rows="1" maxlength="600" placeholder="Tulis pertanyaanmu…" autocomplete="off">${localStorage.getItem(draftKey) || ''}</textarea>
            <button class="btn icon-btn" type="submit" aria-label="Kirim">${icon('send')}</button></form>
        </div></div></div>`,
      mount(root) {
        const ta = root.querySelector('#msg');
        if (chat.remaining === 0) showLimit();
        ta?.addEventListener('input', () => {
          localStorage.setItem(draftKey, ta.value);
          ta.style.height = 'auto';
          ta.style.height = `${Math.min(160, ta.scrollHeight)}px`;
        });
        ta?.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !e.shiftKey && matchMedia('(pointer: fine)').matches) {
            e.preventDefault();
            ta.form.requestSubmit();
          }
        });
        scrollChat();
        flushOutbox();
      },
      forms: {
        async send(form, data) {
          const text = (data.text || '').trim();
          if (!text) { form.text.focus(); announce('Tulis pertanyaanmu dulu, ya.'); return; }
          const item = { client_msg_id: crypto.randomUUID(), conversation_id: chat.convId, text, created_at: new Date().toISOString(), status: 'antre' };
          await outbox.put(item);
          form.text.value = '';
          form.text.style.height = '';
          localStorage.removeItem(draftKey);
          await refreshPendingUi();
          if (!navigator.onLine) announce('Sinyal hilang. Pesanmu disimpan dan dikirim nanti.');
          flushOutbox();
        },
      },
      actions: {
        async retry(btn) {
          const items = await outbox.all();
          const it = items.find((x) => x.client_msg_id === btn.dataset.id);
          if (it) { await outbox.put({ ...it, status: 'antre', error: undefined }); flushOutbox(); }
        },
        async fb(btn) {
          const id = btn.closest('[data-id]').dataset.id;
          try {
            const r = await api(`/api/messages/${id}/feedback`, { method: 'POST', body: { kind: btn.dataset.kind } });
            btn.parentElement.querySelectorAll('[data-kind]').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
            const m = chat.messages.find((x) => x.id === id);
            if (m) m.feedback = btn.dataset.kind;
            toast(r.message);
          } catch (err) { toast(err.message); }
        },
        async human(btn) {
          const id = btn.closest('[data-id]').dataset.id;
          await busy(btn, 'Meneruskan…', async () => {
            try { toast((await api(`/api/messages/${id}/ask-human`, { method: 'POST' })).message); } catch (err) { toast(err.message); }
          });
        },
        async older(btn) {
          const first = chat.messages[0];
          await busy(btn, 'Memuat…', async () => {
            const d = await api(`/api/chat/conversations/${chat.convId}?before=${encodeURIComponent(first.created_at)}`);
            chat.messages = [...d.messages, ...chat.messages];
            chat.more = d.more;
            document.getElementById('chat-list').innerHTML = String(chatItems());
          });
        },
      },
    };
  };
  route('/tanya', chatRoute, { shell: (b) => shell('/tanya', b) });
  route('/tanya/:id', chatRoute, { shell: (b) => shell('/tanya', b) });

  // S8 Riwayat
  route('/riwayat', async () => {
    let list;
    let offline = false;
    try { list = (await api('/api/chat/conversations')).conversations; } catch (err) {
      if (!err.offline) throw err;
      offline = true;
      list = (await convs.all()).map((c) => ({ id: c.id, title: c.title, topic: c.topic, updated_at: c.updated_at }));
    }
    const groups = new Map();
    for (const c of list) {
      const k = fmt.day(c.updated_at || Date.now());
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(c);
    }
    return {
      title: 'Riwayat',
      body: shell('/tanya', html`<div class="stack"><div class="topbar">${back('/tanya', 'Kembali ke Tanya')}<h1>Riwayat</h1></div>
        ${offline ? banner('info', 'Menampilkan riwayat yang tersimpan di ponsel ini.') : ''}
        ${list.length ? [...groups].map(([day, items]) => html`<section class="stack-sm"><h2 class="caption">${day}</h2><ul class="list card tight">
          ${items.map((c) => html`<li><a class="list-item" href="/tanya/${c.id}"><span class="grow"><span class="truncate">${c.title || 'Percakapan'}</span><br>
          ${c.topic ? html`<span class="chip topic">${c.topic}</span>` : html`<span class="caption">Tanpa topik</span>`}</span></a></li>`)}</ul></section>`)
          : emptyState('Belum ada percakapan.', html`<a class="btn" href="/tanya">Mulai bertanya</a>`)}
        <div class="card stack-sm"><h2>Hapus riwayat di ponsel ini</h2><p class="muted">Menghapus salinan di ponsel ini saja, tidak menghapus data di server. Untuk menghapus data di server, pakai “Minta penghapusan data” di Profil.</p>
          <button class="btn secondary" type="button" data-action="clear">Hapus riwayat di ponsel ini</button></div></div>`),
      actions: {
        async clear() {
          const ok = await confirmDialog({ title: 'Hapus riwayat di ponsel ini?', body: 'Salinan percakapan, draf, dan pesan yang belum terkirim di ponsel ini akan dihapus. Data di server tidak berubah.', confirm: 'Hapus', danger: true });
          if (!ok) return;
          await clearLocal();
          toast('Riwayat di ponsel ini sudah dihapus.');
        },
      },
    };
  }, { shell: (b) => shell('/tanya', b) });

  // S9 Profil
  route('/profil', () => {
    const me = state.me;
    const prefs = me.prefs || {};
    const u = dataUsage();
    return {
      title: 'Profil',
      body: shell('/profil', html`<div class="stack"><h1>Profil</h1>
        <div class="card"><dl class="kv"><dt>Nama panggilan</dt><dd>${me.name}</dd><dt>Kelas</dt><dd>${me.class_name || '–'}</dd></dl></div>
        <section class="card" aria-labelledby="set-h"><h2 id="set-h">Tampilan dan data</h2>
          <label class="switch">Mode Hemat Data<input type="checkbox" role="switch" name="hemat" data-change="hemat" ${hemat() ? 'checked' : ''}></label>
          <p class="help">Tanpa animasi dan riwayat dimuat sedikit demi sedikit.</p>
          <hr class="sep">
          <div class="field"><label for="tema">Tema</label><select id="tema" data-change="tema">
            ${[['sistem', 'Ikuti pengaturan ponsel'], ['terang', 'Terang'], ['gelap', 'Gelap']].map(([v, l]) => html`<option value="${v}" ${currentTheme() === v ? 'selected' : ''}>${l}</option>`)}</select></div>
          <div class="field"><label for="ukuran">Ukuran teks</label><select id="ukuran" data-change="ukuran">
            ${[['normal', 'Normal'], ['besar', 'Besar'], ['sangat-besar', 'Sangat besar']].map(([v, l]) => html`<option value="${v}" ${(prefs.ukuran || 'normal') === v ? 'selected' : ''}>${l}</option>`)}</select></div>
        </section>
        <section class="card stack-sm" aria-labelledby="data-h"><h2 id="data-h">Perkiraan data terpakai</h2>
          <p><span class="num">±${fmt.kb(u.bytes)}</span> minggu ini · <span class="num">±${fmt.kb(sessionUsage())}</span> sesi ini</p>
          <p class="caption">Perkiraan kasar dari ponsel ini. Operator seluler bisa menghitung sedikit berbeda.</p></section>
        <ul class="list card tight">
          <li><a class="list-item" href="/riwayat">${icon('list')}<span class="grow">Riwayat percakapan</span></a></li>
          <li><a class="list-item" href="/privasi">${icon('shield')}<span class="grow">Baca lagi penjelasan data</span></a></li>
          ${me.pretest_done ? html`<li><a class="list-item" href="/tes/awal/hasil">${icon('chart')}<span class="grow">Hasil Tes Awal</span></a></li>` : ''}
        </ul>
        <section class="card stack-sm" aria-labelledby="help-h"><h2 id="help-h">Butuh bicara dengan orang dewasa?</h2>
          <p>${me.help?.text || 'Bicarakan dengan gurumu atau orang tuamu.'}</p><p class="caption">${me.help?.contacts || ''}</p></section>
        <div class="stack-sm"><button class="btn secondary block" type="button" data-action="delete">Minta penghapusan data</button>
          <button class="btn ghost block" type="button" data-action="logout">${icon('logout')}Keluar</button></div>
      </div>`),
      changes: {
        hemat(el) { savePrefs({ hemat: el.checked }); },
        tema(el) { savePrefs({ tema: el.value }); },
        ukuran(el) { savePrefs({ ukuran: el.value }); },
      },
      actions: {
        async delete() {
          const ok = await confirmDialog({
            title: 'Minta penghapusan data?', body: 'Permintaan dikirim ke koordinator. Semua pertanyaan, hasil latihan, dan hasil tesmu akan dihapus paling lambat 7 hari kerja. Akunmu juga ikut dihapus.',
            confirm: 'Kirim permintaan', danger: true,
          });
          if (!ok) return;
          try { toast((await api('/api/me/deletion-request', { method: 'POST' })).message); } catch (err) { toast(err.message); }
        },
      },
    };
  });

  // S3 Tes awal / akhir
  route('/tes/:kind', async ({ params, query }) => {
    const kind = params.kind;
    if (!['awal', 'akhir'].includes(kind)) return { redirect: '/beranda' };
    const d = await api(`/api/assessments/${kind}`);
    if (d.finished) return { redirect: `/tes/${kind}/hasil` };
    const key = `kajar-tes-${kind}`;
    const local = JSON.parse(localStorage.getItem(key) || '{}');
    const answers = { ...d.answers, ...local };
    const name = kind === 'awal' ? 'Tes Awal' : 'Tes Akhir';
    const no = Number(query.get('no') || 0);
    const total = d.questions.length;
    if (!no) {
      const started = Object.keys(answers).length;
      return {
        title: name,
        body: html`<main class="wrap no-tabs stack" id="isi"><div class="topbar">${back('/beranda', 'Kembali ke Beranda')}<h1>${name}</h1></div>
          <div class="card stack-sm"><p><strong>Ini bukan nilai sekolah.</strong> Tujuannya supaya KAJAR tahu mulai dari mana.</p>
          <ul class="prose"><li>${total} soal Matematika kelas X, pilihan ganda.</li><li>Tidak ada batas waktu. Kira-kira 15 menit.</li>
          <li>Jawabanmu tersimpan di ponsel, jadi aman kalau sinyal putus.</li></ul></div>
          <a class="btn block" href="/tes/${kind}?no=${started ? Math.min(total, started + 1) : 1}">${started ? `Lanjutkan dari soal ${Math.min(total, started + 1)}` : 'Mulai'}</a></main>`,
      };
    }
    const q = d.questions[no - 1];
    if (!q) return { redirect: `/tes/${kind}?no=1` };
    let saveTimer;
    const syncServer = () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => api(`/api/assessments/${kind}/save`, { method: 'POST', body: { answers: JSON.parse(localStorage.getItem(key) || '{}') } }).catch(() => {}), 800);
    };
    return {
      title: `${name} · Soal ${no}`,
      body: html`<main class="wrap no-tabs stack" id="isi">
        <div class="topbar"><h1 class="grow">${name}</h1><span class="caption num">Soal ${no} dari ${total}</span></div>
        <div class="progress" role="progressbar" aria-label="Kemajuan tes" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${no}"><span data-w="${Math.round((no / total) * 100)}"></span></div>
        <form data-form="next" class="stack" novalidate><fieldset class="card stack"><legend class="question">${q.stem}</legend>
          <div class="options">${q.options.map((o, i) => html`<label class="opt"><input type="radio" name="ans" value="${o}" data-change="pick" ${answers[q.id] === o ? 'checked' : ''}>
            <span class="mark"></span><span><span class="sr-only">Pilihan ${String.fromCharCode(65 + i)}: </span>${o}</span></label>`)}</div></fieldset>
          <p class="caption" id="saved" role="status">${answers[q.id] ? 'Tersimpan di ponsel' : ''}</p>
          <div class="actions">${no > 1 ? html`<a class="btn secondary" href="/tes/${kind}?no=${no - 1}">Sebelumnya</a>` : ''}
            <button class="btn" type="submit">${no === total ? 'Kirim jawaban' : 'Lanjut'}</button></div>
          <a class="btn ghost block" href="/beranda">Simpan dan lanjutkan nanti</a>
        </form></main>`,
      changes: {
        pick(el) {
          const cur = JSON.parse(localStorage.getItem(key) || '{}');
          cur[q.id] = el.value;
          localStorage.setItem(key, JSON.stringify(cur));
          document.getElementById('saved').textContent = 'Tersimpan di ponsel';
          syncServer();
        },
      },
      forms: {
        async next(form, data, btn) {
          if (no < total) { go(`/tes/${kind}?no=${no + 1}`); return; }
          const all = { ...d.answers, ...JSON.parse(localStorage.getItem(key) || '{}') };
          const empty = d.questions.filter((x) => !all[x.id]).length;
          if (empty) {
            const ok = await confirmDialog({ title: `Masih ada ${empty} soal kosong`, body: 'Soal kosong dihitung belum bisa. Kirim sekarang atau kembali mengisi?', confirm: 'Kirim sekarang', cancel: 'Kembali mengisi' });
            if (!ok) { go(`/tes/${kind}?no=${d.questions.findIndex((x) => !all[x.id]) + 1}`); return; }
          }
          await busy(btn, 'Mengirim…', async () => {
            try {
              await api(`/api/assessments/${kind}/submit`, { method: 'POST', body: { answers: all } });
              localStorage.removeItem(key);
              await refreshMe();
              go(`/tes/${kind}/hasil`);
            } catch (err) {
              toast(err.offline ? 'Sinyal hilang. Jawabanmu aman di ponsel. Kirim lagi saat ada sinyal.' : err.message);
            }
          });
        },
      },
    };
  });

  // S10 Hasil tes
  route('/tes/:kind/hasil', async ({ params }) => {
    const { result } = await api(`/api/assessments/${params.kind}/result`);
    const name = params.kind === 'awal' ? 'Tes Awal' : 'Tes Akhir';
    return {
      title: `Hasil ${name}`,
      body: shell('/beranda', html`<div class="stack"><div class="topbar">${back('/beranda', 'Kembali ke Beranda')}<h1>Hasil ${name}</h1></div>
        ${banner('info', 'Hasil ini hanya untuk menentukan latihanmu. Bukan nilai sekolah.')}
        ${result.score ? html`<p class="card">Skor: <strong class="num">${result.score.raw} dari ${result.score.total}</strong></p>` : ''}
        <section class="card stack-sm"><h2>Topik yang sudah kuat</h2>${result.strong.length ? html`<ul class="prose">${result.strong.map((s) => html`<li>${s}</li>`)}</ul>` : html`<p class="muted">Belum ada. Tidak apa-apa, kita mulai pelan-pelan.</p>`}</section>
        <section class="card stack-sm"><h2>Topik yang perlu latihan</h2>${result.practice.length ? html`<ul class="list">${result.practice.map((p) => html`<li><a class="list-item" href="/latihan/${p.slug}"><span class="grow">${p.name}</span>${icon('book')}</a></li>`)}</ul>` : html`<p class="muted">Semua topik sudah kuat. Hebat!</p>`}</section>
        <a class="btn block" href="/latihan">Mulai latihan</a></div>`),
    };
  });

  void esc;
}

async function savePrefs(patch) {
  state.me.prefs = { ...(state.me.prefs || {}), ...patch };
  applyPrefs(state.me.prefs);
  try { await api('/api/me/prefs', { method: 'PUT', body: patch }); toast('Pengaturan disimpan.'); } catch { toast('Pengaturan disimpan di ponsel ini.'); }
}
void logout;
