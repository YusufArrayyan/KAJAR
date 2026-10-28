// Signed-out screens: S0 Masuk, S1 Daftar, staff sign-in, and the public data explanation.
import { html, raw, api, route, go, setHome, fieldError, clearErrors, busy, banner, LOGO, state, icon } from './app.js';
import { privacyBody } from './privacy.js';

const reg = { step: 1, code: '', className: '', nickname: '' };

function shell(body) {
  return html`<main class="auth stack" id="isi">${body}</main>`;
}

// Blue band with the logo; the page content overlaps it.
function heroShell(body, tagline = 'Belajar ditemani, hemat data') {
  return html`<div class="auth-hero"><span class="logo-disc">${LOGO}</span><h1 translate="no">KAJAR</h1><p>${tagline}</p></div>
    <main class="auth lifted stack" id="isi">${body}</main>`;
}

let configPromise;
const getConfig = () => (configPromise ||= api('/api/config').catch(() => ({ demo: false })));

// DEMO_MODE only: judges and visitors sign in with one click, no passwords.
const DEMO_ACCOUNTS = [
  ['siswa_baru', 'Siswa baru', 'Mulai dari penjelasan data dan Tes Awal', 'user', 't1'],
  ['siswa', 'Siswa (Rani)', 'Sudah berjalan, ada catatan dari Kakak', 'book', 't3'],
  ['peninjau', 'Kakak peninjau', 'Antrean tinjauan dan rubrik', 'hand', 't7'],
  ['guru', 'Guru', 'Dasbor kelas dan insiden', 'chart', 't4'],
  ['koordinator', 'Koordinator', 'Persetujuan, hasil tes, ekspor', 'users', 't2'],
  ['admin', 'Admin', 'Konten, prompt, keamanan, biaya', 'cog', 't6'],
];
const demoPanel = (cfg) => (cfg.demo ? html`<section class="card demo" aria-labelledby="demo-h">
  <div class="stack-sm"><span class="chip topic">Mode demo</span><h2 id="demo-h">Masuk cepat untuk juri</h2>
  <p class="muted">Pilih peran, langsung masuk tanpa kata sandi. Data di sini contoh dan diulang dari awal saat server dimulai ulang.</p></div>
  <ul class="topic-list" role="list">${DEMO_ACCOUNTS.map(([k, label, hint, ic, tone]) => html`<li><button class="topic-row" type="button" data-action="demo" data-account="${k}">
    <span class="qi small ${tone}">${icon(ic)}</span><span class="grow"><strong>${label}</strong><span class="caption">${hint}</span></span><span class="go">${icon('back')}</span></button></li>`)}</ul>
  <p class="form-error field-error" role="alert" hidden></p></section>` : '');

const demoActions = {
  async demo(btn) {
    await busy(btn, 'Masuk…', async () => {
      try {
        const r = await api('/api/auth/demo', { method: 'POST', body: { account: btn.dataset.account } });
        location.href = r.home;
      } catch (err) {
        const box = btn.closest('section').querySelector('.form-error');
        box.hidden = false;
        box.textContent = err.message;
      }
    });
  },
};

export default function register() {
  setHome(() => (location.pathname.startsWith('/staf') ? '/staf/masuk' : '/masuk'));

  route('/masuk', async () => ({
    title: 'Masuk',
    actions: demoActions,
    body: heroShell(html`${demoPanel(await getConfig())}
      <form data-form="login" class="card stack" novalidate><h2>Masuk sebagai siswa</h2>
        <div class="field"><label for="nick">Nama panggilan</label>
          <input id="nick" name="nickname" type="text" autocomplete="username" spellcheck="false" autocapitalize="words" maxlength="20" required></div>
        <div class="field"><label for="pin">PIN (6 angka)</label>
          <input id="pin" class="pin" name="pin" type="password" inputmode="numeric" pattern="[0-9]*" autocomplete="current-password" maxlength="6" required></div>
        <p class="field-error form-error" role="alert" hidden></p>
        <button class="btn block" type="submit">Masuk</button>
      </form>
      <p>Belum punya akun? <a href="/daftar">Daftar pakai kode kelas</a></p>
      <p class="caption">Mahasiswa peninjau, guru, atau admin? <a href="/staf/masuk">Masuk di sini</a></p>`),
    forms: {
      async login(form, data, btn) {
        clearErrors(form);
        if (!data.nickname.trim()) return fieldError(form, 'nickname', 'Tulis nama panggilanmu.');
        if (!/^\d{6}$/.test(data.pin)) return fieldError(form, 'pin', 'PIN harus 6 angka.');
        await busy(btn, 'Masuk…', async () => {
          try {
            await api('/api/auth/student/login', { method: 'POST', body: data });
            location.href = '/beranda';
          } catch (err) {
            fieldError(form, err.code === 'TERKUNCI' ? null : 'pin', err.message);
          }
        });
        return undefined;
      },
    },
  }));

  route('/daftar', () => {
    const steps = {
      1: html`<div class="field"><label for="code">Kode kelas</label>
          <input id="code" class="code-input" name="code" type="text" autocomplete="off" spellcheck="false" autocapitalize="characters" maxlength="12" value="${reg.code}" required aria-describedby="code-help">
          <p class="help" id="code-help">Kode 8 huruf dan angka dari gurumu, misalnya MATEKX01.</p><p class="field-error" id="err-code" role="alert" hidden></p></div>`,
      2: html`<p class="caption">Kelas ${reg.className}</p><div class="field"><label for="nickname">Nama panggilan</label>
          <input id="nickname" name="nickname" type="text" autocomplete="off" spellcheck="false" autocapitalize="words" maxlength="20" value="${reg.nickname}" required aria-describedby="nick-help">
          <p class="help" id="nick-help">Jangan pakai nama lengkap atau nomor telepon. Nama ini dipakai untuk masuk.</p><p class="field-error" id="err-nickname" role="alert" hidden></p></div>`,
      3: html`<div class="field"><label for="pin">PIN (6 angka)</label>
          <input id="pin" class="pin" name="pin" type="password" inputmode="numeric" pattern="[0-9]*" autocomplete="new-password" maxlength="6" required aria-describedby="pin-help">
          <p class="help" id="pin-help">Pilih angka yang mudah kamu ingat tapi sulit ditebak orang lain.</p><p class="field-error" id="err-pin" role="alert" hidden></p></div>
        <div class="field"><label for="pin2">Ulangi PIN</label>
          <input id="pin2" class="pin" name="pin2" type="password" inputmode="numeric" pattern="[0-9]*" autocomplete="new-password" maxlength="6" required>
          <p class="field-error" id="err-pin2" role="alert" hidden></p></div>`,
    };
    return {
      title: 'Daftar',
      body: shell(html`<div class="topbar"><a class="back" href="/masuk" aria-label="Kembali ke halaman masuk">${raw('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" width="24" height="24"><path d="M15 5l-7 7 7 7"/></svg>')}</a><h1>Daftar</h1></div>
        <p class="steps-indicator" aria-live="polite">Langkah ${reg.step} dari 3</p>
        <form data-form="step" class="card stack" novalidate>${steps[reg.step]}
          <p class="field-error form-error" role="alert" hidden></p>
          <div class="actions">${reg.step > 1 ? html`<button class="btn secondary" type="button" data-action="prev">Kembali</button>` : ''}
          <button class="btn" type="submit">${reg.step === 3 ? 'Buat akun' : 'Lanjut'}</button></div>
        </form>`),
      mount(root) { if (matchMedia('(pointer: fine)').matches) root.querySelector('input')?.focus(); },
      actions: { prev() { reg.step -= 1; go('/daftar', { replace: true }); } },
      forms: {
        async step(form, data, btn) {
          clearErrors(form);
          if (reg.step === 1) {
            const code = (data.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
            if (code.length < 6) return fieldError(form, 'code', 'Kode kelas belum lengkap. Cek lagi ke gurumu.');
            await busy(btn, 'Memeriksa…', async () => {
              try {
                const r = await api('/api/auth/student/check-code', { method: 'POST', body: { code } });
                Object.assign(reg, { code, className: r.class_name, step: 2 });
                go('/daftar', { replace: true });
              } catch (err) { fieldError(form, 'code', err.message); }
            });
          } else if (reg.step === 2) {
            const nick = (data.nickname || '').trim();
            if (nick.length < 2) return fieldError(form, 'nickname', 'Nama panggilan minimal 2 huruf.');
            if (/\d{5,}/.test(nick)) return fieldError(form, 'nickname', 'Jangan pakai nomor telepon sebagai nama panggilan.');
            if (nick.split(/\s+/).length > 2) return fieldError(form, 'nickname', 'Cukup nama panggilan, jangan nama lengkap.');
            Object.assign(reg, { nickname: nick, step: 3 });
            go('/daftar', { replace: true });
          } else {
            if (!/^\d{6}$/.test(data.pin)) return fieldError(form, 'pin', 'PIN harus 6 angka.');
            if (data.pin !== data.pin2) return fieldError(form, 'pin2', 'PIN belum sama. Ketik ulang.');
            await busy(btn, 'Membuat akun…', async () => {
              try {
                await api('/api/auth/student/register', { method: 'POST', body: { code: reg.code, nickname: reg.nickname, pin: data.pin, pin2: data.pin2 } });
                location.href = '/mulai';
              } catch (err) {
                if (err.field === 'nickname' || err.field === 'code') {
                  reg.step = err.field === 'code' ? 1 : 2;
                  await go('/daftar', { replace: true });
                  const f = document.querySelector('form[data-form="step"]');
                  if (f) fieldError(f, err.field, err.message);
                } else fieldError(form, err.field || null, err.message);
              }
            });
          }
          return undefined;
        },
      },
    };
  });

  route('/staf/masuk', async ({ query }) => ({
    title: 'Masuk staf',
    body: heroShell(html`${demoPanel(await getConfig())}
      <h2>Masuk untuk peninjau, guru, dan admin</h2>
      ${query.get('tautan') === 'kedaluwarsa' ? banner('warn', 'Tautan masuk sudah kedaluwarsa atau sudah dipakai. Minta tautan baru.') : ''}
      <form data-form="staff" class="card stack" novalidate>
        <div class="field"><label for="email">Email</label>
          <input id="email" name="email" type="email" autocomplete="email" spellcheck="false" inputmode="email" required></div>
        <div class="field"><label for="password">Kata sandi</label>
          <input id="password" name="password" type="password" autocomplete="current-password" required></div>
        <p class="field-error form-error" role="alert" hidden></p>
        <button class="btn block" type="submit">Masuk</button>
        <button class="btn ghost block" type="button" data-action="magic">Kirim tautan masuk ke email</button>
      </form>
      <p class="caption">Siswa? <a href="/masuk">Masuk dengan nama panggilan dan PIN</a></p>`),
    forms: {
      async staff(form, data, btn) {
        clearErrors(form);
        if (!data.email.includes('@')) return fieldError(form, 'email', 'Email belum lengkap. Contoh: nama@kampus.ac.id');
        if (!data.password) return fieldError(form, 'password', 'Tulis kata sandimu.');
        await busy(btn, 'Masuk…', async () => {
          try {
            await api('/api/auth/staff/login', { method: 'POST', body: data });
            location.href = '/';
          } catch (err) { fieldError(form, err.code === 'TERKUNCI' ? null : 'password', err.message); }
        });
        return undefined;
      },
    },
    actions: {
      ...demoActions,
      async magic(btn) {
        const form = btn.closest('form');
        const email = form.email.value.trim();
        clearErrors(form);
        if (!email.includes('@')) return fieldError(form, 'email', 'Tulis email dulu, lalu tekan Kirim tautan.');
        await busy(btn, 'Mengirim…', async () => {
          try {
            const r = await api('/api/auth/staff/magic-link', { method: 'POST', body: { email } });
            const box = form.querySelector('.form-error');
            box.hidden = false;
            box.className = 'help form-error';
            box.textContent = r.message;
          } catch (err) { fieldError(form, 'email', err.message); }
        });
        return undefined;
      },
    },
  }));

  route('/privasi', () => ({ title: 'Penjelasan data', body: shell(privacyBody(false)) }));
  route('/', () => ({ redirect: '/masuk' }));
  void state;
}
