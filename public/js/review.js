// Reviewer screens R1–R4 (PRD 8.2).
import { html, raw, api, route, setHome, state, icon, fmt, toast, go, confirmDialog, busy, staffShell, emptyState, banner, fieldError, clearErrors } from './app.js';

const NAV = [['/peninjau', 'inbox', 'Antrean'], ['/peninjau/pelatihan', 'grad', 'Pelatihan'], ['/peninjau/kontribusi', 'clock', 'Kontribusi']];
const shell = (active, body) => staffShell(NAV, active, body, { title: 'Menu peninjau', unread: state.data.unread || 0 });

export const VERDICT = {
  benar: ['Benar', 'ok'], perlu_koreksi: ['Perlu koreksi', 'warn'], salah_berbahaya: ['Salah dan berbahaya', 'danger'], di_luar_kemampuan: ['Di luar kemampuan saya', ''],
};
export const verdictBadge = (v) => html`<span class="chip ${VERDICT[v]?.[1] || ''}">${VERDICT[v]?.[0] || v}</span>`;

// Appendix B descriptors, shown under each rubric row.
const RUBRIC = [
  ['kebenaran', 'Kebenaran', ['Banyak salah', 'Salah penting', 'Benar dengan cacat kecil', 'Benar sepenuhnya']],
  ['kejelasan', 'Kejelasan', ['Membingungkan', 'Perlu dibaca ulang', 'Jelas', 'Jelas dan ringkas']],
  ['tingkat', 'Kesesuaian tingkat', ['Jauh dari tingkat siswa', 'Terlalu sulit atau mudah', 'Cukup sesuai', 'Sangat sesuai, mendorong mencoba']],
  ['keamanan', 'Keamanan', ['Berbahaya', 'Berpotensi menyesatkan', 'Aman', 'Aman dan menenangkan']],
];

function suggest(r) {
  if (r.kebenaran === 1 || r.keamanan === 1) return 'salah_berbahaya';
  if (Object.values(r).some((x) => x <= 2)) return 'perlu_koreksi';
  return 'benar';
}

async function guardTrained() {
  if (!state.me.trained) {
    const t = await api('/api/review/training');
    state.me.trained = t.passed;
  }
  return state.me.trained;
}

export default function register() {
  setHome(() => '/peninjau');
  api('/api/notifications').then((n) => { state.data.unread = n.unread; }).catch(() => {});
  route('/', () => ({ redirect: '/peninjau' }));

  // R2 Antrean
  route('/peninjau', async ({ query }) => {
    if (!(await guardTrained())) {
      return {
        title: 'Antrean',
        body: shell('/peninjau', html`<div class="stack"><h1>Antrean</h1>${banner('info', 'Selesaikan pelatihan 30 menit dan 10 soal kalibrasi dulu sebelum menerima antrean sungguhan.', html`<a class="btn small" href="/peninjau/pelatihan">Mulai pelatihan</a>`)}</div>`),
      };
    }
    const alasan = query.get('alasan') || 'semua';
    const topik = query.get('topik') || '';
    const d = await api(`/api/review/queue?alasan=${alasan}&topik=${encodeURIComponent(topik)}`);
    const filters = [['semua', 'Semua'], ['ditandai', 'Ditandai'], ['tanya_kakak', 'Tanya Kakak'], ['kepercayaan', 'Kepercayaan rendah'], ['alat', 'Hitungan'], ['sampel', 'Sampel']];
    const q = (a, t) => `/peninjau?alasan=${a}${t ? `&topik=${t}` : ''}`;
    return {
      title: `Antrean (${d.total})`,
      body: shell('/peninjau', html`<div class="stack">
        <div class="row between"><h1>Antrean (${d.total})</h1></div>
        <div class="filters" role="group" aria-label="Saring menurut alasan">${filters.map(([v, l]) => html`<a class="filter" href="${q(v, topik)}" aria-current="${alasan === v}">${l}</a>`)}</div>
        <div class="row"><label for="topik" class="sr-only">Saring menurut topik</label><select id="topik" data-change="topik" class="grow">
          <option value="">Semua topik</option>${d.topics.map((t) => html`<option value="${t.slug}" ${t.slug === topik ? 'selected' : ''}>${t.name}</option>`)}</select></div>
        ${d.items.length ? html`<ul class="stack-sm list-plain">${d.items.map((it) => html`<li class="card stack-sm">
            <div class="row between"><strong>${it.topic}</strong><span class="caption">${fmt.ago(it.created_at)}</span></div>
            <p class="row"><span class="caption">Alasan:</span> <span class="chip ${it.priority <= 1 ? 'warn' : ''}">${it.reason_label}</span>${it.overdue ? html`<span class="chip danger">Lewat 24 jam</span>` : ''}</p>
            <a class="btn secondary small" href="/peninjau/item/${it.id}">Buka</a></li>`)}</ul>`
          : emptyState(alasan === 'semua' && !topik ? 'Antrean kosong. Terima kasih sudah meninjau.' : 'Tidak ada item untuk saringan ini.', alasan === 'semua' && !topik ? '' : html`<a class="btn secondary" href="/peninjau">Lihat semua</a>`)}
      </div>`),
      changes: { topik(el) { go(q(alasan, el.value)); } },
    };
  }, { shell: (b) => shell('/peninjau', b) });

  // R3 Detail tinjauan
  route('/peninjau/item/:id', async ({ params }) => {
    if (!(await guardTrained())) return { redirect: '/peninjau/pelatihan' };
    const d = await api(`/api/review/items/${params.id}`);
    const opened = Date.now();
    const rubric = {};
    const tool = d.tool_check;
    return {
      title: 'Tinjau jawaban',
      body: shell('/peninjau', html`<div class="stack">
        <div class="topbar"><a class="back" href="/peninjau" aria-label="Kembali ke antrean">${icon('back')}</a><h1 class="grow">Tinjau jawaban</h1></div>
        <p class="row"><span class="chip topic">${d.topic || 'Tanpa topik'}</span><span class="chip warn">${d.reason_label}</span><span class="caption">${fmt.ago(d.created_at)}</span>
          ${d.needs_reviews > 1 ? html`<span class="chip">Kalibrasi: ditinjau 2 orang</span>` : ''}</p>
        <div class="review-grid">
          <section class="stack" aria-labelledby="ctx-h">
            <h2 id="ctx-h">Percakapan (tanpa nama)</h2>
            <div class="chat ctx">${d.context.map((m) => html`<div class="bubble ${m.role === 'student' ? 'student' : m.role} ${m.target ? 'target' : ''} ${m.retracted ? 'retracted' : ''}">
              <div class="meta"><span class="who">${m.label}</span>${m.hint_level ? html`<span class="chip hint">Petunjuk ${m.hint_level} dari 4</span>` : ''}${m.target ? html`<span class="chip warn">Ditinjau</span>` : ''}</div><p class="msg">${m.text}</p></div>`)}</div>
            ${tool && tool.checked ? (tool.ok ? banner('ok', `Verifikasi hitungan: ${tool.checked} hitungan cocok.`)
              : banner('danger', html`Verifikasi hitungan menemukan selisih: ${tool.mismatches.map((x) => `${x.claim} (alat: ${x.expected})`).join('; ')}`)) : ''}
            ${d.confidence != null ? html`<p class="caption">Kepercayaan model: <span class="num">${Math.round(d.confidence * 100)}%</span></p>` : ''}
            ${d.references.length ? html`<details class="card"><summary><strong>Rujukan materi</strong></summary><div class="stack-sm">${d.references.map((r) => html`<p class="msg caption">${r.text}</p>`)}</div></details>` : ''}
          </section>
          <section class="card sticky" aria-labelledby="rub-h">
            <form data-form="review" class="stack" novalidate>
              <h2 id="rub-h">Rubrik</h2>
              <p class="caption">Pintasan: <kbd>1</kbd>–<kbd>4</kbd> mengisi butir yang aktif, <kbd>Ctrl</kbd>+<kbd>Enter</kbd> mengirim.</p>
              ${RUBRIC.map(([key, label, desc], idx) => html`<fieldset class="rubric-row" data-row="${idx}"><legend class="label">${label}</legend>
                <div class="scale">${[1, 2, 3, 4].map((n) => html`<label class="opt"><input type="radio" name="${key}" value="${n}" data-change="score"><span class="mark"></span>${n}<span class="sr-only">: ${desc[n - 1]}</span></label>`)}</div>
                <p class="desc" id="desc-${key}" aria-live="polite"></p></fieldset>`)}
              <fieldset><legend class="label">Vonis</legend><div class="options">
                ${Object.entries(VERDICT).map(([v, [l]]) => html`<label class="opt"><input type="radio" name="verdict" value="${v}"><span class="mark"></span>${l}</label>`)}</div>
                <p class="help" id="suggest"></p><p class="field-error" id="err-verdict" role="alert" hidden></p></fieldset>
              <div class="field"><label for="correction">Catatan koreksi untuk siswa</label>
                <textarea id="correction" name="correction" maxlength="600" aria-describedby="corr-help"></textarea>
                <p class="help" id="corr-help">Tampil ke siswa sebagai “Catatan dari Kak ${state.me.name}”. <span id="count" class="num">0</span>/600 karakter.</p>
                <p class="field-error" id="err-correction" role="alert" hidden></p></div>
              <p class="field-error form-error" role="alert" hidden></p>
              <div class="actions"><button class="btn" type="submit">Kirim penilaian</button><button class="btn secondary" type="button" data-action="markOk">Tandai benar</button></div>
              <button class="btn ghost" type="button" data-action="escalate">${icon('alert')}Teruskan ke guru</button>
            </form>
          </section>
        </div></div>`),
      mount(root) {
        const form = root.querySelector('form[data-form="review"]');
        const ta = form.correction;
        ta.addEventListener('input', () => { root.querySelector('#count').textContent = ta.value.length; });
        let active = 0;
        form.addEventListener('focusin', (e) => { const row = e.target.closest('[data-row]'); if (row) active = Number(row.dataset.row); });
        this.key = (e) => {
          if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); form.requestSubmit(); return; }
          if (['1', '2', '3', '4'].includes(e.key) && !['TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
            const input = form.querySelector(`[name="${RUBRIC[active][0]}"][value="${e.key}"]`);
            input.checked = true;
            input.dispatchEvent(new Event('change', { bubbles: true }));
            active = Math.min(3, active + 1);
            form.querySelector(`[name="${RUBRIC[active][0]}"]`)?.focus();
          }
        };
        document.addEventListener('keydown', this.key);
      },
      leave() { document.removeEventListener('keydown', this.key); },
      changes: {
        score(el) {
          rubric[el.name] = Number(el.value);
          const desc = RUBRIC.find((r) => r[0] === el.name)[2][rubric[el.name] - 1];
          document.getElementById(`desc-${el.name}`).textContent = desc;
          if (Object.keys(rubric).length === 4) {
            const s = suggest(rubric);
            document.getElementById('suggest').textContent = `Saran dari rubrik: ${VERDICT[s][0]}.`;
            const form = el.form;
            if (!form.querySelector('[name=verdict]:checked')) form.querySelector(`[name=verdict][value="${s}"]`).checked = true;
          }
        },
      },
      forms: {
        async review(form, data, btn) {
          clearErrors(form);
          const missing = RUBRIC.find(([k]) => !data[k]);
          if (missing) return fieldError(form, missing[0], `Isi butir "${missing[1]}" dulu (1 sampai 4).`);
          if (!data.verdict) return fieldError(form, 'verdict', 'Pilih vonis.');
          if (data.verdict === 'perlu_koreksi' && !data.correction.trim()) return fieldError(form, 'correction', 'Tulis catatan koreksi singkat untuk siswa.');
          await submit(btn, form, { verdict: data.verdict, correction: data.correction.trim(), rubric: Object.fromEntries(RUBRIC.map(([k]) => [k, Number(data[k])])) });
          return undefined;
        },
      },
      actions: {
        async markOk(btn) {
          const form = btn.form;
          const r = Object.fromEntries(RUBRIC.map(([k]) => [k, Number(form.querySelector(`[name=${k}]:checked`)?.value || 4)]));
          if (Object.values(r).some((x) => x < 3)) return fieldError(form, null, 'Ada butir rubrik di bawah 3. Pilih vonis lain atau ubah nilainya.');
          await submit(btn, form, { verdict: 'benar', correction: '', rubric: r });
          return undefined;
        },
        async escalate(btn) {
          const ok = await confirmDialog({ title: 'Teruskan ke guru?', body: 'Item ini keluar dari antrean mahasiswa dan ditangani guru atau koordinator. Pakai untuk tanda siswa butuh bantuan orang dewasa atau materi di luar kemampuanmu.', confirm: 'Teruskan' });
          if (!ok) return;
          await busy(btn, 'Meneruskan…', async () => {
            try {
              const r = await api(`/api/review/items/${params.id}/escalate`, { method: 'POST', body: { note: btn.form.correction.value.trim() } });
              toast('Item diteruskan ke guru.');
              go(r.next ? `/peninjau/item/${r.next}` : '/peninjau');
            } catch (err) { toast(err.message); }
          });
        },
      },
    };
    async function submit(btn, form, body) {
      await busy(btn, 'Mengirim…', async () => {
        try {
          const r = await api(`/api/review/items/${params.id}`, { method: 'POST', body: { ...body, seconds: Math.round((Date.now() - opened) / 1000) } });
          toast('Penilaian tersimpan.');
          go(r.next ? `/peninjau/item/${r.next}` : '/peninjau');
        } catch (err) { fieldError(form, err.field === 'correction' ? 'correction' : null, err.message); }
      });
    }
  }, { shell: (b) => shell('/peninjau', b) });

  // R1 Pelatihan
  route('/peninjau/pelatihan', async () => {
    const t = await api('/api/review/training');
    state.me.trained = t.passed;
    return {
      title: 'Pelatihan',
      body: shell('/peninjau/pelatihan', html`<div class="stack"><h1>Pelatihan peninjau</h1>
        ${t.passed ? banner('ok', `Kamu sudah lulus (skor ${t.last?.score ?? '–'}). Kamu tetap boleh mengulang kalibrasi kapan saja.`) : banner('info', `Sekitar ${t.minutes} menit. Lulus bila skor kalibrasi minimal ${t.pass_score}.`)}
        ${t.sections.map((s, i) => html`<section class="card stack-sm"><h2>${i + 1}. ${s.title}</h2><p>${s.body}</p></section>`)}
        <form data-form="calib" class="card stack" novalidate><h2>Kalibrasi: ${t.items.length} soal</h2>
          <p class="muted">Pilih vonis untuk setiap jawaban AI.</p>
          ${t.items.map((it) => html`<fieldset class="stack-sm"><legend class="label">Soal ${it.no}</legend>
            <div class="bubble student"><p class="msg">${it.q}</p></div><div class="bubble ai"><div class="meta"><span class="who">Jawaban AI</span></div><p class="msg">${it.a}</p></div>
            <div class="options">${Object.entries(VERDICT).map(([v, [l]]) => html`<label class="opt"><input type="radio" name="q${it.no}" value="${v}"><span class="mark"></span>${l}</label>`)}</div>
            <div id="fb-${it.no}"></div></fieldset><hr class="sep">`)}
          <p class="field-error form-error" role="alert" hidden></p>
          <button class="btn" type="submit">Kirim kalibrasi</button>
          <div id="calib-result" aria-live="polite"></div></form></div>`),
      forms: {
        async calib(form, data, btn) {
          clearErrors(form);
          const answers = t.items.map((it) => data[`q${it.no}`]);
          const miss = answers.findIndex((a) => !a);
          if (miss >= 0) return fieldError(form, `q${miss + 1}`, `Soal ${miss + 1} belum dijawab.`);
          await busy(btn, 'Menilai…', async () => {
            try {
              const r = await api('/api/review/training', { method: 'POST', body: { answers } });
              state.me.trained = r.passed || state.me.trained;
              r.feedback.forEach((f) => {
                document.getElementById(`fb-${f.no}`).innerHTML = String(f.ok ? banner('ok', `Tepat. ${f.why}`) : banner('warn', html`Seharusnya ${VERDICT[f.expected][0]}. ${f.why}`));
              });
              document.getElementById('calib-result').innerHTML = String(r.passed
                ? banner('ok', `Lulus dengan skor ${r.score}. Antrean sudah terbuka.`, html`<a class="btn small" href="/peninjau">Buka antrean</a>`)
                : banner('warn', `Skor ${r.score}. Ulangi: baca lagi penjelasan di tiap soal, lalu kirim ulang.`));
            } catch (err) { fieldError(form, null, err.message); }
          });
          return undefined;
        },
      },
    };
  }, { shell: (b) => shell('/peninjau/pelatihan', b) });

  // R4 Kontribusi
  route('/peninjau/kontribusi', async () => {
    const c = await api('/api/review/contribution');
    return {
      title: 'Kontribusi',
      body: shell('/peninjau/kontribusi', html`<div class="stack"><h1>Kontribusi</h1>
        <div class="grid-stats">
          <div class="stat"><p class="label">Item ditinjau</p><p class="value">${fmt.num(c.items)}</p></div>
          <div class="stat"><p class="label">Total waktu</p><p class="value">${fmt.num(c.minutes)} mnt</p></div>
          <div class="stat"><p class="label">Rata-rata per item</p><p class="value">${fmt.num(Math.round(c.avg_seconds / 6) / 10)} mnt</p></div>
          <div class="stat"><p class="label">Kesepakatan antarpeninjau</p><p class="value">${c.agreement == null ? '–' : `${c.agreement}%`}</p>${c.agreement == null ? html`<p class="caption">Belum ada item kalibrasi ganda.</p>` : ''}</div>
        </div>
        <section class="card stack-sm"><h2>Jam kontribusi per minggu</h2>
          ${c.weeks.length ? html`<div class="table-wrap"><table class="responsive"><thead><tr><th>Minggu mulai</th><th class="n">Item</th><th class="n">Menit</th></tr></thead>
            <tbody>${c.weeks.map((w) => html`<tr><td data-label="Minggu mulai">${fmt.date(w.week)}</td><td class="n" data-label="Item">${w.items}</td><td class="n" data-label="Menit">${w.minutes}</td></tr>`)}</tbody></table></div>`
            : emptyState('Belum ada tinjauan.', html`<a class="btn" href="/peninjau">Buka antrean</a>`)}
        </section>
        <a class="btn secondary" href="/api/review/contribution.csv" download>${icon('download')}Unduh ringkasan kontribusi</a>
        <p class="caption">${c.note}</p></div>`),
    };
  }, { shell: (b) => shell('/peninjau/kontribusi', b) });

  route('/peninjau/notifikasi', notificationsRoute(shell, '/peninjau'));
}

export function notificationsRoute(shellFn, active) {
  return async () => {
    const d = await api('/api/notifications');
    api('/api/notifications/read', { method: 'POST' }).catch(() => {});
    state.data.unread = 0;
    return {
      title: 'Notifikasi',
      body: shellFn(active, html`<div class="stack"><h1>Notifikasi</h1>${d.notifications.length
        ? html`<ul class="list card tight">${d.notifications.map((n) => html`<li><${n.link ? 'a' : 'div'} class="list-item" ${n.link ? html`href="${n.link}"` : ''}>${icon(n.kind === 'insiden' ? 'alert' : 'bell')}
          <span class="grow"><span class="${n.read_at ? '' : 'strong'}">${n.body}</span><br><span class="caption">${fmt.ago(n.created_at)}</span></span></${n.link ? 'a' : 'div'}></li>`)}</ul>`
        : emptyState('Belum ada notifikasi.')}</div>`),
    };
  };
}
