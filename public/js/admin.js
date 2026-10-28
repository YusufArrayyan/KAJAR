// Admin screens A1–A5 (PRD 8.4).
import { html, api, route, setHome, state, icon, fmt, toast, go, confirmDialog, busy, staffShell, emptyState, banner, fieldError, clearErrors, render } from './app.js';
import { bars, dataTable } from './charts.js';

const NAV = [['/admin/konten', 'book', 'Konten'], ['/admin/aturan', 'cog', 'Prompt dan Aturan'], ['/admin/keamanan', 'shield', 'Keamanan'], ['/admin/biaya', 'coin', 'Biaya'], ['/admin/audit', 'list', 'Audit']];
const shell = (active, body) => staffShell(NAV, active, body, { title: 'Menu admin' });
const STATUS = { draft: ['Draf', ''], ditinjau: ['Ditinjau', 'warn'], terbit: ['Terbit', 'ok'] };
const statusChip = (s) => html`<span class="chip ${STATUS[s][1]}">${STATUS[s][0]}</span>`;

// One editable setting with save + rollback (F-ADM-3: versioned, reversible).
function settingField(key, label, value, versions, { type = 'number', help = '', step = 'any' } = {}) {
  const shown = Array.isArray(value) ? value.join('\n') : value ?? '';
  const input = type === 'list' || type === 'textarea'
    ? html`<textarea id="set-${key}" name="value" rows="${type === 'list' ? 5 : 3}" spellcheck="false" aria-describedby="help-${key}">${shown}</textarea>`
    : type === 'bool' ? html`<select id="set-${key}" name="value"><option value="1" ${value ? 'selected' : ''}>Ya</option><option value="" ${value ? '' : 'selected'}>Tidak</option></select>`
      : html`<input id="set-${key}" name="value" type="number" step="${step}" inputmode="decimal" value="${shown}" autocomplete="off" aria-describedby="help-${key}">`;
  return html`<form data-form="setting" data-key="${key}" data-type="${type}" class="stack-sm setting" novalidate>
    <label for="set-${key}">${label}</label>${input}<p class="help" id="help-${key}">${help}</p><p class="field-error form-error" role="alert" hidden></p>
    <div class="row"><button class="btn small" type="submit">Simpan</button>
    ${versions?.length > 1 ? html`<label class="sr-only" for="ver-${key}">Versi sebelumnya</label><select id="ver-${key}" class="grow" data-ver="${key}">${versions.slice(1).map((v) => html`<option value="${v.version}">Versi ${v.version} · ${fmt.date(v.created_at)}</option>`)}</select>
      <button class="btn small ghost" type="button" data-action="rollback" data-key="${key}">Kembalikan versi</button>` : html`<span class="caption">Versi ${versions?.[0]?.version || 'bawaan'}</span>`}</div></form>`;
}

const settingForms = {
  async setting(form, data, btn) {
    clearErrors(form);
    const t = form.dataset.type;
    let value = data.value;
    if (t === 'list') value = value.split('\n').map((x) => x.trim()).filter(Boolean);
    else if (t === 'number') value = value === '' ? null : Number(value);
    else if (t === 'bool') value = Boolean(value);
    else if (t === 'patterns') value = JSON.parse(value);
    await busy(btn, 'Menyimpan…', async () => {
      try { const r = await api(`/api/admin/settings/${form.dataset.key}`, { method: 'PUT', body: { value } }); toast(`Tersimpan sebagai versi ${r.version}.`); render(); } catch (err) { fieldError(form, null, err.message); }
    });
  },
};
const settingActions = {
  async rollback(btn) {
    const key = btn.dataset.key;
    const version = Number(document.querySelector(`[data-ver="${key}"]`).value);
    const ok = await confirmDialog({ title: `Kembalikan ke versi ${version}?`, body: 'Nilai lama dipakai lagi dan tercatat sebagai versi baru di log audit.', confirm: 'Kembalikan' });
    if (!ok) return;
    await api(`/api/admin/settings/${key}/rollback`, { method: 'POST', body: { version } });
    toast('Versi dikembalikan.');
    render();
  },
};

export default function register() {
  setHome(() => '/admin/konten');
  route('/', () => ({ redirect: '/admin/konten' }));

  // A1 Konten
  route('/admin/konten', async ({ query }) => {
    const status = query.get('status') || 'semua';
    const pool = query.get('bank') || 'latihan';
    const d = await api(`/api/admin/questions?status=${status}&pool=${pool}`);
    const link = (s, p = pool) => `/admin/konten?bank=${p}&status=${s}`;
    return {
      title: 'Konten',
      body: shell('/admin/konten', html`<div class="stack"><div class="row between"><h1>Konten</h1>${pool === 'latihan' ? html`<a class="btn small" href="/admin/konten/baru">Tambah soal</a>` : ''}</div>
        <div class="filters" role="group" aria-label="Bank soal">${[['latihan', 'Latihan'], ['awal', 'Tes awal'], ['akhir', 'Tes akhir']].map(([v, l]) => html`<a class="filter" href="${link('semua', v)}" aria-current="${pool === v}">${l}</a>`)}</div>
        <div class="filters" role="group" aria-label="Status">${[['semua', 'Semua'], ['draft', `Draf (${d.counts.draft})`], ['ditinjau', `Ditinjau (${d.counts.ditinjau})`], ['terbit', `Terbit (${d.counts.terbit})`]].map(([v, l]) => html`<a class="filter" href="${link(v)}" aria-current="${status === v}">${l}</a>`)}</div>
        ${banner('warn', 'Soal contoh ditulis pengembang. Guru wajib meninjau setiap soal sebelum dipakai di sekolah. Hanya soal berstatus Terbit yang tampil ke siswa.')}
        ${d.questions.length ? html`<div class="table-wrap"><table class="responsive"><thead><tr><th>Topik</th><th>Soal</th><th>Status</th><th></th></tr></thead><tbody>
          ${d.questions.map((q) => html`<tr><td data-label="Topik">${q.topic}</td><td data-label="Soal" class="break">${q.stem}</td><td data-label="Status">${statusChip(q.status)}</td>
          <td data-label="Aksi"><a class="btn small secondary" href="/admin/konten/${q.id}">${pool === 'latihan' ? 'Ubah' : 'Lihat'}</a></td></tr>`)}</tbody></table></div>` : emptyState('Tidak ada soal untuk saringan ini.')}
        ${pool === 'latihan' ? html`<form data-form="import" class="card stack" novalidate><h2>Impor soal dari CSV</h2>
          <p class="muted">Baris pertama: <code>topic_slug,stem,answer_key,step1,step2,step3,step4</code>. Semua soal impor masuk sebagai draf.</p>
          <div class="field"><label for="csvfile">Berkas CSV</label><input id="csvfile" name="file" type="file" accept=".csv,text/csv"></div>
          <p class="field-error form-error" role="alert" hidden></p><button class="btn secondary" type="submit">Impor sebagai draf</button><div id="import-result" aria-live="polite"></div></form>
          <p class="caption">Topik: ${d.topics.map((t) => t.slug).join(', ')}</p>` : ''}
        <p><a href="/admin/materi">Kelola materi rujukan (pencarian materi tutor)</a></p></div>`),
      forms: {
        async import(form, data, btn) {
          clearErrors(form);
          const file = form.file.files[0];
          if (!file) return fieldError(form, 'file', 'Pilih berkas CSV dulu.');
          if (file.size > 200 * 1024) return fieldError(form, 'file', 'Berkas terlalu besar (maks. 200 KB). Pecah jadi beberapa berkas.');
          await busy(btn, 'Mengimpor…', async () => {
            try {
              const r = await api('/api/admin/questions/import', { method: 'POST', body: await file.text() });
              document.getElementById('import-result').innerHTML = String(html`${banner(r.errors.length ? 'warn' : 'ok', `${r.created} soal masuk sebagai draf.${r.errors.length ? ` ${r.errors.length} baris ditolak.` : ''}`)}
                ${r.errors.length ? html`<ul class="caption">${r.errors.map((e) => html`<li>${e}</li>`)}</ul>` : ''}`);
            } catch (err) { fieldError(form, null, err.message); }
          });
          return undefined;
        },
      },
    };
  }, { shell: (b) => shell('/admin/konten', b) });

  route('/admin/konten/:id', async ({ params }) => {
    const isNew = params.id === 'baru';
    const { topics } = await api('/api/admin/questions?status=semua');
    const q = isNew ? { stem: '', answer_key: '', status: 'draft', steps: ['', '', '', ''], slug: topics[0].slug, assessment_pool: 'latihan' } : (await api(`/api/admin/questions/${params.id}`)).question;
    const editable = q.assessment_pool === 'latihan';
    const labels = ['Petunjuk 1: pertanyaan penuntun', 'Petunjuk 2: konsep atau rumus', 'Petunjuk 3: langkah pertama selesai', 'Petunjuk 4: langkah lengkap'];
    return {
      title: isNew ? 'Soal baru' : 'Ubah soal',
      body: shell('/admin/konten', html`<div class="stack"><div class="topbar"><a class="back" href="/admin/konten" aria-label="Kembali ke daftar soal">${icon('back')}</a><h1>${isNew ? 'Soal baru' : 'Ubah soal'}</h1>${isNew ? '' : statusChip(q.status)}</div>
        ${editable ? '' : banner('info', 'Soal tes dikunci agar tes awal dan akhir tetap setara selama pilot.')}
        <form data-form="save" class="card stack" novalidate>
          <div class="field"><label for="topic">Topik</label><select id="topic" name="topic" ${editable ? '' : 'disabled'}>${topics.map((t) => html`<option value="${t.slug}" ${t.slug === q.slug ? 'selected' : ''}>${t.name}</option>`)}</select></div>
          <div class="field"><label for="stem">Teks soal</label><textarea id="stem" name="stem" maxlength="1000" ${editable ? '' : 'readonly'}>${q.stem}</textarea><p class="field-error" id="err-stem" role="alert" hidden></p></div>
          <div class="field"><label for="key">Kunci jawaban</label><input id="key" name="answer_key" type="text" autocomplete="off" spellcheck="false" value="${q.answer_key}" ${editable ? '' : 'readonly'} aria-describedby="key-help">
            <p class="help" id="key-help">Pisahkan beberapa bentuk yang benar dengan tanda |, misalnya 0.6|3/5.</p><p class="field-error" id="err-answer_key" role="alert" hidden></p></div>
          ${q.options ? html`<p class="caption">Pilihan: ${q.options.join(' · ')}</p>` : ''}
          ${editable ? labels.map((l, i) => html`<div class="field"><label for="step${i}">${l}</label><textarea id="step${i}" name="step${i}" rows="2">${q.steps[i] || ''}</textarea></div>`) : ''}
          ${editable ? html`<div class="field"><label for="status">Status</label><select id="status" name="status">${Object.entries(STATUS).filter(([s]) => !isNew || s !== 'terbit').map(([s, [l]]) => html`<option value="${s}" ${q.status === s ? 'selected' : ''}>${l}</option>`)}</select>
            <p class="help">Urutan wajib: Draf → Ditinjau (sudah diperiksa guru atau peninjau) → Terbit.</p></div>
          <p class="field-error form-error" role="alert" hidden></p><button class="btn" type="submit">Simpan soal</button>` : ''}
        </form>
        ${editable ? html`<section class="card stack-sm"><h2>Pratinjau tampilan siswa</h2><p class="question">${q.stem || 'Teks soal muncul di sini.'}</p>
          ${q.steps.filter(Boolean).slice(0, 1).map((s) => html`<div class="hint-box"><span class="chip hint">Petunjuk 1 dari 4</span><p>${s}</p></div>`)}</section>` : ''}</div>`),
      forms: {
        async save(form, data, btn) {
          clearErrors(form);
          if (data.stem.trim().length < 10) return fieldError(form, 'stem', 'Teks soal minimal 10 karakter.');
          if (!data.answer_key.trim()) return fieldError(form, 'answer_key', 'Kunci jawaban wajib diisi.');
          const body = { topic: data.topic, stem: data.stem, answer_key: data.answer_key, status: data.status, steps: [0, 1, 2, 3].map((i) => data[`step${i}`] || '') };
          await busy(btn, 'Menyimpan…', async () => {
            try {
              const r = await api(isNew ? '/api/admin/questions' : `/api/admin/questions/${params.id}`, { method: isNew ? 'POST' : 'PUT', body });
              toast('Soal tersimpan.');
              go(`/admin/konten/${r.id}`, { replace: true });
            } catch (err) { fieldError(form, err.field || null, err.message); }
          });
          return undefined;
        },
      },
    };
  }, { shell: (b) => shell('/admin/konten', b) });

  route('/admin/materi', async () => {
    const { chunks } = await api('/api/admin/chunks');
    const kinds = { penuntun: 'Pertanyaan penuntun', materi: 'Konsep dan rumus', contoh: 'Contoh langkah', serupa: 'Soal serupa' };
    return {
      title: 'Materi rujukan',
      body: shell('/admin/konten', html`<div class="stack"><div class="topbar"><a class="back" href="/admin/konten" aria-label="Kembali ke konten">${icon('back')}</a><h1>Materi rujukan</h1></div>
        <p class="muted">Tutor hanya memakai materi berstatus Terbit sebagai sumber fakta dan rumus. Catat lisensi setiap potongan.</p>
        ${chunks.map((c) => html`<form data-form="chunk" data-id="${c.id}" class="card stack-sm" novalidate><div class="row"><strong class="grow">${c.topic}</strong><span class="chip">${kinds[c.kind] || c.kind}</span>${statusChip(c.status)}</div>
          <label class="sr-only" for="t-${c.id}">Teks materi</label><textarea id="t-${c.id}" name="text" rows="4">${c.text}</textarea>
          <div class="grid-2"><div class="field"><label for="l-${c.id}">Catatan lisensi</label><input id="l-${c.id}" name="license_note" type="text" autocomplete="off" value="${c.license_note}"></div>
          <div class="field"><label for="s-${c.id}">Status</label><select id="s-${c.id}" name="status">${Object.entries(STATUS).map(([s, [l]]) => html`<option value="${s}" ${c.status === s ? 'selected' : ''}>${l}</option>`)}</select></div></div>
          <p class="field-error form-error" role="alert" hidden></p><button class="btn small secondary" type="submit">Simpan materi</button></form>`)}</div>`),
      forms: {
        async chunk(form, data, btn) {
          clearErrors(form);
          await busy(btn, 'Menyimpan…', async () => {
            try { await api(`/api/admin/chunks/${form.dataset.id}`, { method: 'PUT', body: data }); toast('Materi tersimpan.'); } catch (err) { fieldError(form, null, err.message); }
          });
        },
      },
    };
  }, { shell: (b) => shell('/admin/konten', b) });

  // A2 Prompt dan aturan
  route('/admin/aturan', async () => {
    const [{ prompts }, { settings: s, versions: v }] = await Promise.all([api('/api/admin/prompts'), api('/api/admin/settings')]);
    const active = prompts.find((p) => p.active);
    return {
      title: 'Prompt dan aturan',
      body: shell('/admin/aturan', html`<div class="stack"><h1>Prompt dan aturan</h1>
        <section class="card stack-sm"><h2>Prompt sistem tutor</h2><p class="caption">Aktif: versi ${active?.version}. Nama model diatur lewat variabel lingkungan, bukan di sini.</p>
          <pre class="prompt">${active?.body}</pre>
          <details><summary><strong>Semua versi</strong></summary><ul class="list">${prompts.map((p) => html`<li class="list-item"><span class="grow">Versi ${p.version} · ${fmt.date(p.created_at)}</span>
            ${p.active ? html`<span class="chip ok">Aktif</span>` : html`<button class="btn small ghost" type="button" data-action="activate" data-id="${p.id}" data-v="${p.version}">Aktifkan</button>`}</li>`)}</ul></details>
          <form data-form="prompt" class="stack-sm" novalidate><label for="pbody">Versi baru</label><textarea id="pbody" name="body" rows="10" spellcheck="false">${active?.body}</textarea>
            <p class="help">Wajib memuat {hint_level} dan {retrieved_chunks}. Versi baru tersimpan tidak aktif; uji dengan set evaluasi dulu, lalu aktifkan.</p>
            <p class="field-error form-error" role="alert" hidden></p><button class="btn secondary" type="submit">Simpan sebagai versi baru</button></form></section>
        <section class="card stack"><h2>Aturan antrean dan pemakaian</h2>
          ${settingField('sample_rate', 'Persentase sampel acak (0–1)', s.sample_rate, v.sample_rate, { help: 'Default 0,1 = 10% jawaban tanpa tanda ikut ditinjau.' })}
          ${settingField('confidence_threshold', 'Ambang kepercayaan (0–1)', s.confidence_threshold, v.confidence_threshold, { help: 'Jawaban di bawah ambang masuk antrean dan diberi label "kurang yakin".' })}
          ${settingField('double_review_rate', 'Persentase item ditinjau dua orang (0–1)', s.double_review_rate, v.double_review_rate, { help: 'Untuk mengukur kesepakatan antarpeninjau.' })}
          ${settingField('daily_message_limit', 'Batas pertanyaan harian per siswa', s.daily_message_limit, v.daily_message_limit, { step: 1 })}
          ${settingField('max_input_chars', 'Panjang pesan siswa maksimum (karakter)', s.max_input_chars, v.max_input_chars, { step: 1 })}
          ${settingField('sla_hours', 'Target waktu tinjau (jam)', s.sla_hours, v.sla_hours, { step: 1 })}
          ${settingField('reviewer_pass_score', 'Skor lulus kalibrasi peninjau', s.reviewer_pass_score, v.reviewer_pass_score, { step: 1 })}
          ${settingField('show_numeric_score', 'Tampilkan skor angka di hasil tes siswa', s.show_numeric_score, v.show_numeric_score, { type: 'bool' })}
          ${settingField('refused_topics', 'Topik yang ditolak halus (satu per baris)', s.refused_topics, v.refused_topics, { type: 'list', help: 'Pertanyaan berisi kata ini diarahkan kembali ke pelajaran.' })}
        </section></div>`),
      forms: {
        ...settingForms,
        async prompt(form, data, btn) {
          clearErrors(form);
          await busy(btn, 'Menyimpan…', async () => {
            try { const r = await api('/api/admin/prompts', { method: 'POST', body: data }); toast(`Versi ${r.version} tersimpan (belum aktif).`); render(); } catch (err) { fieldError(form, null, err.message); }
          });
        },
      },
      actions: {
        ...settingActions,
        async activate(btn) {
          const ok = await confirmDialog({ title: `Aktifkan prompt versi ${btn.dataset.v}?`, body: 'Semua jawaban baru langsung memakai versi ini. Pastikan sudah lulus set evaluasi.', confirm: 'Aktifkan' });
          if (!ok) return;
          await api(`/api/admin/prompts/${btn.dataset.id}/activate`, { method: 'POST' });
          toast('Prompt diaktifkan.');
          render();
        },
      },
    };
  }, { shell: (b) => shell('/admin/aturan', b) });

  // A3 Keamanan
  route('/admin/keamanan', async () => {
    const { settings: s, versions: v } = await api('/api/admin/settings');
    return {
      title: 'Keamanan',
      body: shell('/admin/keamanan', html`<div class="stack"><h1>Keamanan</h1>
        ${banner('warn', 'Kontak bantuan resmi wajib diisi dari sumber pemerintah yang sudah diverifikasi. Jangan menyalin dari ingatan.')}
        <section class="card stack"><h2>Pola penyaring masukan</h2>
          <form data-form="patterns" class="stack-sm" novalidate>
            <div class="field"><label for="p-tinggi">Risiko tinggi (satu per baris)</label><textarea id="p-tinggi" name="tinggi" rows="6" spellcheck="false">${s.safety_patterns.tinggi.join('\n')}</textarea>
              <p class="help">Pesan langsung dijawab aman, keluar dari antrean mahasiswa, dan memberi notifikasi ke guru dan koordinator.</p></div>
            <div class="field"><label for="p-sedang">Risiko sedang (satu per baris)</label><textarea id="p-sedang" name="sedang" rows="4" spellcheck="false">${s.safety_patterns.sedang.join('\n')}</textarea></div>
            <p class="field-error form-error" role="alert" hidden></p><button class="btn small" type="submit">Simpan pola</button>
            <p class="caption">Versi ${v.safety_patterns?.[0]?.version || 'bawaan'}</p></form></section>
        <section class="card stack">
          ${settingField('output_banned', 'Kata terlarang di jawaban AI (satu per baris)', s.output_banned, v.output_banned, { type: 'list', help: 'Jawaban yang memuat kata ini diganti pesan aman dan ditandai.' })}
          ${settingField('help_text', 'Teks bantuan untuk siswa', s.help_text, v.help_text, { type: 'textarea' })}
          ${settingField('help_contacts', 'Kontak bantuan resmi', s.help_contacts, v.help_contacts, { type: 'textarea', help: 'Tampil di Profil siswa dan di balasan topik berat.' })}
          ${settingField('incident_recipients', 'Penerima notifikasi insiden (peran, satu per baris)', s.incident_recipients, v.incident_recipients, { type: 'list', help: 'Isi dengan teacher dan/atau coordinator. Mahasiswa tidak boleh menerima insiden risiko tinggi.' })}
        </section></div>`),
      forms: {
        ...settingForms,
        async patterns(form, data, btn) {
          clearErrors(form);
          const split = (x) => x.split('\n').map((t) => t.trim()).filter(Boolean);
          if (!split(data.tinggi).length) return fieldError(form, 'tinggi', 'Daftar risiko tinggi tidak boleh kosong.');
          await busy(btn, 'Menyimpan…', async () => {
            try { await api('/api/admin/settings/safety_patterns', { method: 'PUT', body: { value: { tinggi: split(data.tinggi), sedang: split(data.sedang) } } }); toast('Pola tersimpan.'); render(); } catch (err) { fieldError(form, null, err.message); }
          });
          return undefined;
        },
      },
      actions: settingActions,
    };
  }, { shell: (b) => shell('/admin/keamanan', b) });

  // A4 Biaya
  route('/admin/biaya', async () => {
    const [d, { versions: v }] = await Promise.all([api('/api/admin/cost'), api('/api/admin/settings')]);
    return {
      title: 'Biaya',
      body: shell('/admin/biaya', html`<div class="stack"><h1>Biaya model</h1>
        ${d.alert ? banner('warn', d.alert) : ''}
        <div class="grid-stats">
          <div class="stat"><p class="label">Token hari ini</p><p class="value">${fmt.num(d.used_today)}</p><p class="caption">${d.share_today}% dari anggaran harian</p></div>
          <div class="stat"><p class="label">Anggaran harian</p><p class="value">${fmt.num(d.budget)}</p><p class="caption">Lewat anggaran: Tanya Bebas istirahat, Latihan tetap jalan.</p></div>
          <div class="stat"><p class="label">Perkiraan biaya 30 hari</p><p class="value">${d.est_cost_30d_usd == null ? '–' : `US$${fmt.num(d.est_cost_30d_usd)}`}</p><p class="caption">${d.price_per_mtok_usd == null ? 'Isi harga per sejuta token dulu.' : `Harga US$${d.price_per_mtok_usd} per 1 juta token`}</p></div>
          <div class="stat"><p class="label">Penyedia</p><p class="value">${d.provider}</p><p class="caption break">${d.model || ''}</p></div>
        </div>
        <section class="card stack-sm"><h2>Token per hari</h2>
          ${d.days.length ? html`${bars({ labels: d.days.map((x) => fmt.date(x.date)), series: [{ name: 'Token', values: d.days.map((x) => x.tokens) }], label: 'Grafik batang pemakaian token per hari', every: 2 })}
          ${dataTable(['Tanggal', 'Token', 'Pesan'], d.days.map((x) => [fmt.date(x.date), fmt.num(x.tokens), x.messages]))}` : html`<p class="muted">Belum ada pemakaian.</p>`}</section>
        <section class="card stack-sm"><h2>Per kelas (30 hari)</h2>${d.per_class.length ? html`<table><thead><tr><th>Kelas</th><th class="n">Token</th><th class="n">Pesan</th></tr></thead><tbody>
          ${d.per_class.map((c) => html`<tr><td>${c.name}</td><td class="n">${fmt.num(c.tokens)}</td><td class="n">${c.messages}</td></tr>`)}</tbody></table>` : html`<p class="muted">Belum ada data.</p>`}</section>
        <section class="card stack">
          ${settingField('daily_budget_tokens', 'Anggaran token harian', d.budget, v.daily_budget_tokens, { step: 1000 })}
          ${settingField('price_per_mtok_usd', 'Harga per 1 juta token (US$)', d.price_per_mtok_usd, v.price_per_mtok_usd, { help: 'Ambil dari daftar harga penyedia yang berlaku. Kosongkan bila belum diverifikasi.' })}
        </section></div>`),
      forms: settingForms,
      actions: settingActions,
    };
  }, { shell: (b) => shell('/admin/biaya', b) });

  // A5 Audit
  route('/admin/audit', async ({ query }) => {
    const q = query.get('q') || '';
    const { logs } = await api(`/api/admin/audit?q=${encodeURIComponent(q)}`);
    return {
      title: 'Audit',
      body: shell('/admin/audit', html`<div class="stack"><div class="row between"><h1>Log audit</h1><a class="btn small secondary" href="/api/admin/audit.csv" download>${icon('download')}Ekspor CSV</a></div>
        <form data-form="search" class="row" role="search"><label for="aq" class="sr-only">Cari aksi atau entitas</label><input id="aq" class="grow" name="q" type="search" value="${q}" placeholder="Cari aksi, misalnya atur_ulang_pin…" autocomplete="off" spellcheck="false"><button class="btn small" type="submit">Cari</button></form>
        ${logs.length ? html`<div class="table-wrap"><table class="responsive"><thead><tr><th>Waktu</th><th>Pelaku</th><th>Aksi</th><th>Entitas</th></tr></thead><tbody>
          ${logs.map((l) => html`<tr><td data-label="Waktu" class="num">${fmt.date(l.at)} ${fmt.time(l.at)}</td><td data-label="Pelaku">${l.actor}</td><td data-label="Aksi"><code>${l.action}</code></td><td data-label="Entitas">${l.entity}</td></tr>`)}</tbody></table></div>`
          : emptyState(q ? 'Tidak ada log yang cocok.' : 'Belum ada log.')}</div>`),
      forms: { search(form, data) { go(`/admin/audit${data.q ? `?q=${encodeURIComponent(data.q)}` : ''}`); } },
    };
  }, { shell: (b) => shell('/admin/audit', b) });

  route('/admin/notifikasi', () => ({ redirect: '/admin/konten' }));
  void state;
}
