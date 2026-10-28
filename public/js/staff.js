// Teacher and coordinator screens K1–K9 (PRD 8.3).
import { html, raw, api, route, setHome, state, icon, fmt, toast, go, confirmDialog, busy, staffShell, emptyState, banner, fieldError, clearErrors, render } from './app.js';
import { bars, dataTable } from './charts.js';
import { verdictBadge, notificationsRoute } from './review.js';

const NAV = [
  ['/dasbor', 'chart', 'Ikhtisar'], ['/dasbor/mutu', 'check', 'Mutu AI'], ['/dasbor/program', 'clock', 'Program'],
  ['/dasbor/hasil-tes', 'grad', 'Hasil Tes'], ['/dasbor/kelas', 'users', 'Kelas'], ['/dasbor/persetujuan', 'file', 'Persetujuan'],
  ['/dasbor/peninjau', 'hand', 'Peninjau'], ['/dasbor/insiden', 'shield', 'Insiden'], ['/dasbor/ekspor', 'download', 'Ekspor'],
];
const shell = (active, body) => staffShell(NAV, active, body, { title: 'Menu dasbor', unread: state.data.unread || 0 });
const isCoord = () => state.me.role === 'coordinator';
const pct = (n) => (n == null ? '–' : `${n}%`);
const DEMO_NOTE = banner('info', 'Data contoh untuk demo. Angka ini bukan hasil pilot sungguhan.');

async function classFilter(current) {
  const { classes } = await api('/api/dash/classes');
  return html`<div class="row"><label for="kelas" class="sr-only">Pilih kelas</label><select id="kelas" data-change="kelas">
    <option value="semua">Semua kelas</option>${classes.map((c) => html`<option value="${c.id}" ${c.id === current ? 'selected' : ''}>Kelas ${c.name}</option>`)}</select></div>`;
}

export default function register() {
  setHome(() => '/dasbor');
  api('/api/notifications').then((n) => { state.data.unread = n.unread; }).catch(() => {});
  route('/', () => ({ redirect: '/dasbor' }));

  // K1 Ikhtisar
  route('/dasbor', async ({ query }) => {
    const kelas = query.get('kelas') || 'semua';
    const [d, filter] = await Promise.all([api(`/api/dash/overview?kelas=${kelas}`), classFilter(kelas)]);
    const labels = d.per_day.map((x) => fmt.date(x.day));
    const max = (rows) => Math.max(1, ...rows.map((r) => r.n || r.deep));
    return {
      title: 'Ikhtisar',
      body: shell('/dasbor', html`<div class="stack">
        <div class="row between"><h1>Ikhtisar</h1>${filter}</div>${DEMO_NOTE}
        <div class="grid-stats">
          <div class="stat"><p class="label">Siswa terdaftar</p><p class="value">${fmt.num(d.students)}</p></div>
          <div class="stat"><p class="label">Aktif 7 hari terakhir</p><p class="value">${fmt.num(d.active_week)}</p><p class="caption">${d.students ? Math.round((d.active_week / d.students) * 100) : 0}% dari siswa</p></div>
          <div class="stat"><p class="label">Pertanyaan 14 hari</p><p class="value">${fmt.num(d.per_day.reduce((a, b) => a + b.n, 0))}</p></div>
        </div>
        <section class="card stack-sm"><h2>Pertanyaan per hari</h2>
          ${bars({ labels, series: [{ name: 'Pertanyaan', values: d.per_day.map((x) => x.n) }], label: 'Grafik batang jumlah pertanyaan siswa per hari selama 14 hari', every: 2 })}
          ${dataTable(['Tanggal', 'Pertanyaan'], d.per_day.map((x) => [fmt.date(x.day), x.n]), 'Pertanyaan per hari')}</section>
        <div class="grid-2">
          <section class="card stack-sm"><h2>Topik paling sering ditanyakan</h2><p class="caption">28 hari terakhir</p>
            ${d.top_topics.length ? html`<ul class="list">${d.top_topics.map((t) => html`<li class="list-item"><span class="grow">${t.name}<div class="progress" aria-hidden="true"><span data-w="${Math.round((t.n / max(d.top_topics)) * 100)}"></span></div></span><span class="num">${t.n}</span></li>`)}</ul>` : html`<p class="muted">Belum ada pertanyaan.</p>`}</section>
          <section class="card stack-sm"><h2>Tanda kesulitan</h2><p class="caption">Topik dengan banyak petunjuk tingkat 3 dan 4</p>
            ${d.hard_topics.length || d.practice_hard.length ? html`<table><thead><tr><th>Topik</th><th class="n">Tanya Bebas</th><th class="n">Latihan</th></tr></thead><tbody>
              ${mergeHard(d).map((t) => html`<tr><td>${t.name}</td><td class="n">${t.chat}</td><td class="n">${t.practice}</td></tr>`)}</tbody></table>` : html`<p class="muted">Belum ada tanda kesulitan.</p>`}</section>
        </div></div>`),
      changes: { kelas(el) { go(`/dasbor?kelas=${el.value}`); } },
    };
  }, { shell: (b) => shell('/dasbor', b) });

  // K2 Mutu AI
  route('/dasbor/mutu', async ({ query }) => {
    const topik = query.get('topik') || 'semua';
    const d = await api(`/api/dash/quality?topik=${topik}`);
    const seg = (w) => [['benar', 'ok'], ['perlu_koreksi', 'hint'], ['salah_berbahaya', 'danger'], ['di_luar_kemampuan', 'neutral']]
      .map(([k, c]) => html`<span class="${c}" data-w="${w.total ? (w[k] / w.total) * 100 : 0}" data-tip="${verdictName(k)}: ${w[k]} dari ${w.total}"></span>`);
    return {
      title: 'Mutu AI',
      body: shell('/dasbor/mutu', html`<div class="stack">
        <div class="row between"><h1>Mutu AI</h1><div class="row"><label for="topik" class="sr-only">Saring topik</label><select id="topik" data-change="topik">
          <option value="semua">Semua topik</option>${d.topics.map((t) => html`<option value="${t.slug}" ${t.slug === topik ? 'selected' : ''}>${t.name}</option>`)}</select></div></div>
        ${DEMO_NOTE}
        <p class="muted">Dihitung dari jawaban AI yang ditinjau mahasiswa: semua yang ditandai ditambah sampel acak. Karena yang ditandai lebih sering bermasalah, persentase “Benar” di sini cenderung lebih rendah daripada mutu keseluruhan.</p>
        ${d.share ? html`<div class="grid-stats">
          <div class="stat"><p class="label">${verdictBadge('benar')}</p><p class="value">${pct(d.share.benar)}</p></div>
          <div class="stat"><p class="label">${verdictBadge('perlu_koreksi')}</p><p class="value">${pct(d.share.perlu_koreksi)}</p></div>
          <div class="stat"><p class="label">${verdictBadge('salah_berbahaya')}</p><p class="value">${pct(d.share.salah_berbahaya)}</p></div>
          <div class="stat"><p class="label">${verdictBadge('di_luar_kemampuan')}</p><p class="value">${pct(d.share.di_luar_kemampuan)}</p></div></div>
        <section class="card stack-sm"><h2>Tren mingguan</h2>
          <div class="stack-sm">${d.weeks.map((w) => html`<div class="row nowrap"><span class="caption num">${fmt.date(w.week)}</span><div class="stackbar grow" role="img" aria-label="Minggu ${fmt.date(w.week)}: ${w.benar} benar, ${w.perlu_koreksi} perlu koreksi, ${w.salah_berbahaya} salah, ${w.di_luar_kemampuan} di luar kemampuan">${seg(w)}</div><span class="caption num">n=${w.total}</span></div>`)}</div>
          <div class="legend"><span><i class="ok"></i>Benar</span><span><i class="hint"></i>Perlu koreksi</span><span><i class="danger"></i>Salah dan berbahaya</span><span><i class="neutral"></i>Di luar kemampuan</span></div>
          ${dataTable(['Minggu', 'Benar', 'Perlu koreksi', 'Salah', 'Di luar kemampuan', 'Total'], d.weeks.map((w) => [fmt.date(w.week), w.benar, w.perlu_koreksi, w.salah_berbahaya, w.di_luar_kemampuan, w.total]))}</section>`
          : emptyState('Belum ada jawaban yang ditinjau untuk saringan ini.')}
        <section class="stack-sm"><h2>Contoh untuk dibahas</h2><p class="caption">Tanpa nama siswa.</p>
          ${d.examples.length ? d.examples.map((e) => html`<article class="card stack-sm"><div class="row">${verdictBadge(e.verdict)}<span class="chip topic">${e.topic || 'Tanpa topik'}</span><span class="caption">${fmt.date(e.at)}</span></div>
            <div class="bubble ai"><div class="meta"><span class="who">Jawaban AI</span></div><p class="msg">${e.answer}</p></div>
            ${e.correction ? html`<div class="bubble reviewer"><div class="meta"><span class="who">Koreksi peninjau</span></div><p class="msg">${e.correction}</p></div>` : ''}</article>`)
            : html`<p class="muted">Belum ada contoh.</p>`}</section></div>`),
      changes: { topik(el) { go(`/dasbor/mutu?topik=${el.value}`); } },
    };
  }, { shell: (b) => shell('/dasbor/mutu', b) });

  // K3 Program
  route('/dasbor/program', async () => {
    const d = await api('/api/dash/program');
    return {
      title: 'Program',
      body: shell('/dasbor/program', html`<div class="stack"><h1>Kesehatan program</h1>
        ${d.alert ? banner('warn', d.alert) : banner('ok', 'Antrean terkendali. Tidak ada item yang lewat batas waktu.')}
        <div class="grid-stats">
          <div class="stat"><p class="label">Peninjau aktif (14 hari)</p><p class="value">${d.reviewers_active} / ${d.reviewers_total}</p></div>
          <div class="stat"><p class="label">Waktu tunggu median</p><p class="value">${d.median_wait_hours == null ? '–' : `${fmt.num(d.median_wait_hours)} jam`}</p><p class="caption">Target ≤ ${d.sla_hours} jam</p></div>
          <div class="stat"><p class="label">Item tertunda</p><p class="value">${d.pending}</p></div>
          <div class="stat"><p class="label">Lewat ${d.sla_hours} jam</p><p class="value">${d.overdue}</p></div>
          <div class="stat"><p class="label">Kesepakatan antarpeninjau</p><p class="value">${pct(d.agreement)}</p><p class="caption">${d.double_reviewed} item ditinjau 2 orang</p></div>
        </div>
        <p class="caption">Peringatan muncul otomatis bila ada item menunggu lebih dari ${d.sla_hours} jam.</p></div>`),
    };
  }, { shell: (b) => shell('/dasbor/program', b) });

  // K4 Hasil tes
  route('/dasbor/hasil-tes', async () => {
    const d = await api('/api/dash/assessments');
    return {
      title: 'Hasil Tes',
      body: shell('/dasbor/hasil-tes', html`<div class="stack"><h1>Hasil tes awal dan akhir</h1>
        ${banner('warn', d.limitation)}${DEMO_NOTE}
        <section class="card stack-sm"><h2>Ringkasan per kelas</h2><div class="table-wrap"><table class="responsive">
          <thead><tr><th>Kelas</th><th>Kelompok</th><th class="n">Tes awal (n)</th><th class="n">Rata-rata awal</th><th class="n">Tes akhir (n)</th><th class="n">Rata-rata akhir</th></tr></thead>
          <tbody>${d.classes.map((c) => html`<tr><td data-label="Kelas">${c.name}</td><td data-label="Kelompok">${c.group || '–'}</td><td class="n" data-label="Tes awal (n)">${c.awal.n}</td>
            <td class="n" data-label="Rata-rata awal">${c.awal.mean ?? '–'} / ${d.total_items}</td><td class="n" data-label="Tes akhir (n)">${c.akhir.n}</td><td class="n" data-label="Rata-rata akhir">${c.akhir.mean ?? '–'} / ${d.total_items}</td></tr>`)}</tbody></table></div>
          <p class="caption">Rata-rata tes akhir hanya dari siswa yang sudah mengerjakan. Bandingkan kelompok intervensi dan pembanding dengan hati-hati.</p></section>
        ${d.classes.map((c) => html`<section class="card stack-sm"><h2>Sebaran skor kelas ${c.name}</h2>
          ${bars({ labels: d.buckets, series: [{ name: 'Tes awal', values: c.awal.dist }, { name: 'Tes akhir', cls: 's2', values: c.akhir.dist }], label: `Sebaran skor tes awal dan akhir kelas ${c.name}`, height: 180, unit: ' siswa' })}
          ${dataTable(['Rentang skor', 'Tes awal', 'Tes akhir'], d.buckets.map((b, i) => [b, c.awal.dist[i], c.akhir.dist[i]]))}</section>`)}
        <section class="card stack-sm"><h2>Tes Akhir</h2><p>${d.posttest_open ? 'Tes Akhir sedang dibuka untuk siswa.' : 'Tes Akhir masih ditutup.'}</p>
          ${isCoord() ? html`<button class="btn ${d.posttest_open ? 'secondary' : ''}" type="button" data-action="toggle">${d.posttest_open ? 'Tutup Tes Akhir' : 'Buka Tes Akhir'}</button>` : html`<p class="caption">Hanya koordinator yang bisa membuka Tes Akhir.</p>`}</section></div>`),
      actions: {
        async toggle(btn) {
          const open = !d.posttest_open;
          const ok = await confirmDialog({ title: open ? 'Buka Tes Akhir?' : 'Tutup Tes Akhir?', body: open ? 'Semua siswa di sekolah ini bisa langsung mengerjakan Tes Akhir.' : 'Siswa yang belum selesai tidak bisa melanjutkan sampai dibuka lagi.', confirm: open ? 'Buka Tes Akhir' : 'Tutup Tes Akhir' });
          if (!ok) return;
          await busy(btn, 'Menyimpan…', async () => { await api('/api/dash/posttest', { method: 'POST', body: { open } }); toast(open ? 'Tes Akhir dibuka.' : 'Tes Akhir ditutup.'); render(); });
        },
      },
    };
  }, { shell: (b) => shell('/dasbor/hasil-tes', b) });

  // K5 Kelas
  route('/dasbor/kelas', async () => {
    const d = await api('/api/classes');
    return {
      title: 'Kelas',
      body: shell('/dasbor/kelas', html`<div class="stack"><h1>Kelas</h1>
        <div class="table-wrap"><table class="responsive"><thead><tr><th>Kelas</th><th>Kelompok</th><th class="n">Siswa</th><th>Kode kelas</th><th>Persetujuan</th><th></th></tr></thead><tbody>
          ${d.classes.map((c) => html`<tr><td data-label="Kelas"><strong>${c.name}</strong></td><td data-label="Kelompok">${c.group || '–'}</td><td class="n" data-label="Siswa">${c.students}</td>
            <td data-label="Kode kelas">${c.code_active ? html`<span class="chip ok">Aktif</span>` : html`<span class="chip">Nonaktif</span>`}</td>
            <td data-label="Persetujuan">${c.consent.complete ? html`<span class="chip ok">Lengkap</span>` : html`<span class="chip warn">Belum lengkap</span>`}</td>
            <td data-label="Aksi"><div class="actions"><a class="btn small secondary" href="/dasbor/kelas/${c.id}">Siswa</a>
              ${isCoord() ? html`<button class="btn small ghost" type="button" data-action="newCode" data-id="${c.id}" data-name="${c.name}">Kode baru</button>
              ${c.code_active ? html`<button class="btn small ghost" type="button" data-action="disable" data-id="${c.id}" data-name="${c.name}">Nonaktifkan kode</button>` : ''}` : ''}</div></td></tr>`)}
        </tbody></table></div>
        <div id="code-box" aria-live="polite"></div>
        ${isCoord() ? html`<form data-form="create" class="card stack" novalidate><h2>Buat kelas</h2>
          <div class="grid-2"><div class="field"><label for="cname">Nama kelas</label><input id="cname" name="name" type="text" autocomplete="off" maxlength="30" placeholder="Misalnya X-3…"><p class="field-error" id="err-name" role="alert" hidden></p></div>
          <div class="field"><label for="cgroup">Kelompok pilot</label><select id="cgroup" name="group"><option value="">Tidak ditentukan</option><option value="intervensi">Intervensi</option><option value="pembanding">Pembanding</option></select></div></div>
          <p class="field-error form-error" role="alert" hidden></p><button class="btn" type="submit">Buat kelas</button></form>` : ''}
        ${d.deletion_requests.length ? html`<section class="card stack-sm"><h2>Permintaan hapus data</h2><ul class="list">${d.deletion_requests.map((r) => html`<li class="list-item"><span class="grow"><strong>${r.pseudonym}</strong> · Kelas ${r.class_name || '–'}<br><span class="caption">Diminta ${fmt.ago(r.created_at)}. Tenggat 7 hari kerja.</span></span>
          ${isCoord() ? html`<button class="btn small danger" type="button" data-action="erase" data-id="${r.id}" data-p="${r.pseudonym}">Hapus data</button>` : ''}</li>`)}</ul></section>` : ''}</div>`),
      actions: {
        async newCode(btn) {
          const ok = await confirmDialog({ title: `Buat kode baru untuk kelas ${btn.dataset.name}?`, body: 'Kode lama langsung tidak berlaku. Siswa yang sudah terdaftar tidak terpengaruh.', confirm: 'Buat kode baru' });
          if (!ok) return;
          const r = await api(`/api/classes/${btn.dataset.id}/code`, { method: 'POST', body: { action: 'baru' } });
          showCode(btn.dataset.name, r.code);
        },
        async disable(btn) {
          const ok = await confirmDialog({ title: `Nonaktifkan kode kelas ${btn.dataset.name}?`, body: 'Siswa baru tidak bisa mendaftar dengan kode ini. Kamu bisa membuat kode baru kapan saja.', confirm: 'Nonaktifkan kode', danger: true });
          if (!ok) return;
          await api(`/api/classes/${btn.dataset.id}/code`, { method: 'POST', body: { action: 'nonaktif' } });
          toast('Kode kelas dinonaktifkan.');
          render();
        },
        async erase(btn) {
          const ok = await confirmDialog({ title: `Hapus semua data ${btn.dataset.p}?`, body: 'Akun, pertanyaan, hasil latihan, dan hasil tes siswa ini dihapus permanen. Tindakan ini tidak bisa dibatalkan.', confirm: 'Hapus data', danger: true });
          if (!ok) return;
          await api(`/api/deletion-requests/${btn.dataset.id}/execute`, { method: 'POST' });
          toast('Data siswa sudah dihapus.');
          render();
        },
      },
      forms: {
        async create(form, data, btn) {
          clearErrors(form);
          if (!data.name.trim()) return fieldError(form, 'name', 'Tulis nama kelas.');
          await busy(btn, 'Membuat…', async () => {
            try {
              const r = await api('/api/classes', { method: 'POST', body: data });
              await render();
              showCode(data.name, r.code);
            } catch (err) { fieldError(form, err.field || 'name', err.message); }
          });
          return undefined;
        },
      },
    };
  }, { shell: (b) => shell('/dasbor/kelas', b) });

  route('/dasbor/kelas/:id', async ({ params }) => {
    const [{ students }, { classes }] = await Promise.all([api(`/api/classes/${params.id}/students`), api('/api/classes')]);
    const c = classes.find((x) => x.id === params.id);
    return {
      title: `Kelas ${c?.name || ''}`,
      body: shell('/dasbor/kelas', html`<div class="stack"><div class="topbar"><a class="back" href="/dasbor/kelas" aria-label="Kembali ke daftar kelas">${icon('back')}</a><h1>Kelas ${c?.name || ''}</h1></div>
        <p class="muted">Nama panggilan hanya dipakai untuk mengatur ulang PIN. Laporan dan ekspor memakai ID pseudonim.</p>
        <div id="pin-box" aria-live="polite"></div>
        ${students.length ? html`<div class="table-wrap"><table class="responsive"><thead><tr><th>Nama panggilan</th><th>ID pseudonim</th><th>Status</th><th></th></tr></thead><tbody>
          ${students.map((s) => html`<tr><td data-label="Nama panggilan">${s.nickname}</td><td data-label="ID pseudonim" class="num">${s.pseudonym}</td><td data-label="Status">${s.locked ? html`<span class="chip warn">Terkunci</span>` : 'Aktif'}</td>
          <td data-label="Aksi"><button class="btn small secondary" type="button" data-action="reset" data-id="${s.id}" data-name="${s.nickname}">Atur ulang PIN</button></td></tr>`)}</tbody></table></div>`
          : emptyState('Belum ada siswa. Bagikan kode kelas agar siswa bisa mendaftar.')}</div>`),
      actions: {
        async reset(btn) {
          const ok = await confirmDialog({ title: `Atur ulang PIN ${btn.dataset.name}?`, body: 'PIN lama langsung tidak berlaku dan siswa keluar dari semua perangkat. PIN sementara tampil sekali.', confirm: 'Atur ulang PIN' });
          if (!ok) return;
          const r = await api(`/api/classes/${params.id}/reset-pin`, { method: 'POST', body: { user_id: btn.dataset.id } });
          document.getElementById('pin-box').innerHTML = String(banner('ok', html`PIN sementara untuk ${btn.dataset.name}: <strong class="num">${r.pin}</strong>. ${r.message}`));
        },
      },
    };
  }, { shell: (b) => shell('/dasbor/kelas', b) });

  // K6 Persetujuan
  route('/dasbor/persetujuan', async () => {
    const d = await api('/api/classes');
    const row = (c, type, label) => html`<div class="row between"><span>${label}</span>${c.consent[type] ? html`<span class="chip ok">${icon('check')}Tercatat</span>` : html`<span class="chip warn">Belum</span>`}
      ${isCoord() ? html`<button class="btn small ${c.consent[type] ? 'ghost' : 'secondary'}" type="button" data-action="consent" data-id="${c.id}" data-type="${type}" data-on="${c.consent[type] ? '1' : ''}" data-name="${c.name}">${c.consent[type] ? 'Cabut' : 'Catat'}</button>` : ''}</div>`;
    return {
      title: 'Persetujuan',
      body: shell('/dasbor/persetujuan', html`<div class="stack"><h1>Persetujuan</h1>
        <p class="muted">Siswa baru bisa memakai Tanya Bebas setelah persetujuan sekolah dan wali untuk kelasnya tercatat. Latihan tetap bisa dipakai.</p>
        <div class="grid-2">${d.classes.map((c) => html`<section class="card stack-sm"><h2>Kelas ${c.name}</h2>${row(c, 'sekolah', 'Persetujuan sekolah')}${row(c, 'wali', 'Persetujuan wali')}
          <p class="caption">${c.consent.complete ? 'Tanya Bebas aktif.' : 'Tanya Bebas belum aktif.'}</p></section>`)}</div>
        <p class="caption">Simpan dokumen asli di arsip sekolah. Dasar hukum dan formulir persetujuan wali perlu diperiksa unit hukum kampus sebelum pilot.</p></div>`),
      actions: {
        async consent(btn) {
          const on = Boolean(btn.dataset.on);
          const label = btn.dataset.type === 'sekolah' ? 'sekolah' : 'wali';
          let note = '';
          if (!on) {
            const ok = await confirmDialog({ title: `Catat persetujuan ${label} untuk kelas ${btn.dataset.name}?`, body: 'Pastikan dokumen persetujuan sudah ada di arsip sekolah.', confirm: 'Catat' });
            if (!ok) return;
          } else {
            const ok = await confirmDialog({ title: `Cabut persetujuan ${label}?`, body: `Tanya Bebas untuk kelas ${btn.dataset.name} langsung nonaktif. Latihan tetap bisa dipakai.`, confirm: 'Cabut', danger: true });
            if (!ok) return;
          }
          await api(`/api/classes/${btn.dataset.id}/consent`, { method: 'POST', body: { type: btn.dataset.type, action: on ? 'cabut' : 'catat', note } });
          toast(on ? 'Persetujuan dicabut.' : 'Persetujuan dicatat.');
          render();
        },
      },
    };
  }, { shell: (b) => shell('/dasbor/persetujuan', b) });

  // K7 Peninjau
  route('/dasbor/peninjau', async () => {
    const d = await api('/api/reviewers');
    const tr = { lulus: ['Lulus', 'ok'], ulangi: ['Ulangi', 'warn'], belum: ['Belum', ''] };
    return {
      title: 'Peninjau',
      body: shell('/dasbor/peninjau', html`<div class="stack"><h1>Peninjau</h1>
        <div class="table-wrap"><table class="responsive"><thead><tr><th>Nama</th><th>Email</th><th>Pelatihan</th><th class="n">Item (14 hari)</th><th class="n">Menit (14 hari)</th></tr></thead><tbody>
          ${d.reviewers.map((r) => html`<tr><td data-label="Nama">${r.display_name}</td><td data-label="Email" class="break">${r.email}</td><td data-label="Pelatihan"><span class="chip ${tr[r.training][1]}">${tr[r.training][0]}</span></td>
          <td class="n" data-label="Item (14 hari)">${r.reviews_14d}</td><td class="n" data-label="Menit (14 hari)">${r.minutes_14d}</td></tr>`)}</tbody></table></div>
        <div id="invite-box" aria-live="polite"></div>
        ${isCoord() ? html`<form data-form="invite" class="card stack" novalidate><h2>Undang peninjau</h2>
          <div class="grid-2"><div class="field"><label for="rname">Nama panggilan</label><input id="rname" name="name" type="text" autocomplete="off" maxlength="30"><p class="field-error" id="err-name" role="alert" hidden></p></div>
          <div class="field"><label for="remail">Email kampus</label><input id="remail" name="email" type="email" autocomplete="off" spellcheck="false" placeholder="nama@kampus.ac.id…"><p class="field-error" id="err-email" role="alert" hidden></p></div></div>
          <p class="field-error form-error" role="alert" hidden></p><button class="btn" type="submit">Undang peninjau</button></form>` : ''}</div>`),
      forms: {
        async invite(form, data, btn) {
          clearErrors(form);
          if (data.name.trim().length < 2) return fieldError(form, 'name', 'Tulis nama panggilan peninjau.');
          if (!data.email.includes('@')) return fieldError(form, 'email', 'Email belum lengkap. Contoh: nama@kampus.ac.id');
          await busy(btn, 'Mengundang…', async () => {
            try {
              const r = await api('/api/reviewers', { method: 'POST', body: data });
              await render();
              document.getElementById('invite-box').innerHTML = String(banner('ok', html`Kata sandi sementara: <strong class="num">${r.temp_password}</strong>. ${r.message}`));
            } catch (err) { fieldError(form, err.field || null, err.message); }
          });
          return undefined;
        },
      },
    };
  }, { shell: (b) => shell('/dasbor/peninjau', b) });

  // K8 Insiden
  route('/dasbor/insiden', async () => {
    const d = await api('/api/incidents');
    const sev = { tinggi: 'danger', sedang: 'warn', rendah: '' };
    const cat = { keselamatan: 'Keselamatan siswa', emosional: 'Emosional', data_pribadi: 'Data pribadi', jawaban_dicabut: 'Jawaban AI dicabut', diteruskan_peninjau: 'Diteruskan peninjau' };
    return {
      title: 'Insiden',
      body: shell('/dasbor/insiden', html`<div class="stack"><h1>Insiden</h1>
        <p class="muted">Hanya guru dan koordinator yang melihat halaman ini. Isi pesan tampil selama insiden belum selesai.</p>
        ${d.incidents.length ? d.incidents.map((e) => html`<article class="card stack-sm" id="${e.id}">
          <div class="row"><span class="chip ${sev[e.severity]}">Risiko ${e.severity}</span><strong class="grow">${cat[e.category] || e.category}</strong><span class="caption">${fmt.ago(e.created_at)} · Kelas ${e.class_name || '–'}</span></div>
          ${e.text ? html`<div class="bubble student"><p class="msg">${e.text}</p></div>` : ''}
          ${e.note ? html`<p class="caption">Catatan: ${e.note}</p>` : ''}
          <form data-form="incident" data-id="${e.id}" class="stack-sm" novalidate>
            <div class="grid-2"><div class="field"><label for="st-${e.id}">Status</label><select id="st-${e.id}" name="status">${['baru', 'ditangani', 'selesai'].map((s) => html`<option value="${s}" ${e.status === s ? 'selected' : ''}>${s[0].toUpperCase() + s.slice(1)}</option>`)}</select></div>
            <div class="field"><label for="nt-${e.id}">Catatan tindak lanjut</label><input id="nt-${e.id}" name="note" type="text" autocomplete="off" maxlength="600" placeholder="Misalnya: sudah bicara dengan wali kelas…"></div></div>
            <button class="btn small secondary" type="submit">Simpan</button></form></article>`) : emptyState('Belum ada insiden.')}</div>`),
      mount() {
        if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
      },
      forms: {
        async incident(form, data, btn) {
          await busy(btn, 'Menyimpan…', async () => {
            try { await api(`/api/incidents/${form.dataset.id}`, { method: 'POST', body: data }); toast('Tindak lanjut tersimpan.'); render(); } catch (err) { toast(err.message); }
          });
        },
      },
    };
  }, { shell: (b) => shell('/dasbor/insiden', b) });

  // K9 Ekspor
  route('/dasbor/ekspor', () => {
    const items = [
      ['tes', 'Hasil tes', 'id_siswa, kelas, kelompok, tes, skor, maks, selesai'],
      ['aktivitas', 'Aktivitas belajar', 'id_siswa, kelas, pertanyaan, latihan, latihan_benar, petunjuk_l1_l3, petunjuk_l4'],
      ['mutu', 'Mutu AI', 'tanggal, topik, vonis, kebenaran, kejelasan, tingkat, keamanan, detik'],
    ];
    return {
      title: 'Ekspor',
      body: shell('/dasbor/ekspor', html`<div class="stack"><h1>Ekspor</h1>
        <p class="muted">Semua berkas memakai ID pseudonim. Tidak ada nama siswa dan tidak ada isi percakapan.</p>
        ${items.map(([t, name, cols]) => html`<section class="card stack-sm"><h2>${name}</h2><p class="caption">Kolom: <code>${cols}</code></p>
          ${isCoord() ? html`<a class="btn secondary" href="/api/export/csv?type=${t}" download>${icon('download')}Unduh CSV ${name.toLowerCase()}</a>` : html`<p class="caption">Hanya koordinator yang bisa mengunduh.</p>`}</section>`)}
        <section class="card stack-sm"><h2>Laporan ringkas</h2><p class="muted">Ringkasan satu halaman untuk dicetak atau disimpan sebagai PDF.</p><a class="btn secondary" href="/dasbor/laporan">Buka laporan ringkas</a></section></div>`),
    };
  });

  route('/dasbor/laporan', async () => {
    const [o, q, p, a] = await Promise.all([api('/api/dash/overview'), api('/api/dash/quality'), api('/api/dash/program'), api('/api/dash/assessments')]);
    const today = new Intl.DateTimeFormat('id-ID', { dateStyle: 'long' }).format(new Date());
    return {
      title: 'Laporan ringkas',
      body: html`<main class="main stack" id="isi"><div class="row between no-print"><a class="btn ghost small" href="/dasbor/ekspor">${icon('back')}Kembali</a><button class="btn small" type="button" data-action="print">Cetak atau simpan PDF</button></div>
        <h1>Laporan ringkas KAJAR</h1><p class="muted">Dibuat ${today}. Tanpa nama siswa dan tanpa isi percakapan.</p>${DEMO_NOTE}
        <section class="card"><h2>Aktivitas</h2><dl class="kv"><dt>Siswa terdaftar</dt><dd>${o.students}</dd><dt>Aktif 7 hari terakhir</dt><dd>${o.active_week}</dd><dt>Pertanyaan 14 hari</dt><dd>${o.per_day.reduce((s, x) => s + x.n, 0)}</dd></dl></section>
        <section class="card"><h2>Mutu AI (6 minggu)</h2>${q.share ? html`<dl class="kv"><dt>Ditinjau</dt><dd>${q.total} jawaban</dd><dt>Benar</dt><dd>${q.share.benar}%</dd><dt>Perlu koreksi</dt><dd>${q.share.perlu_koreksi}%</dd><dt>Salah dan berbahaya</dt><dd>${q.share.salah_berbahaya}%</dd></dl>` : html`<p>Belum ada data.</p>`}</section>
        <section class="card"><h2>Program</h2><dl class="kv"><dt>Peninjau aktif</dt><dd>${p.reviewers_active} dari ${p.reviewers_total}</dd><dt>Waktu tunggu median</dt><dd>${p.median_wait_hours ?? '–'} jam</dd><dt>Item lewat ${p.sla_hours} jam</dt><dd>${p.overdue}</dd></dl></section>
        <section class="card"><h2>Hasil tes</h2><table><thead><tr><th>Kelas</th><th>Kelompok</th><th class="n">Awal</th><th class="n">Akhir</th></tr></thead><tbody>${a.classes.map((c) => html`<tr><td>${c.name}</td><td>${c.group || '–'}</td><td class="n">${c.awal.mean ?? '–'} (n=${c.awal.n})</td><td class="n">${c.akhir.mean ?? '–'} (n=${c.akhir.n})</td></tr>`)}</tbody></table>
          <p class="caption">${a.limitation}</p></section></main>`,
      actions: { print() { window.print(); } },
    };
  });

  route('/dasbor/notifikasi', notificationsRoute(shell, '/dasbor'));
}

function showCode(name, code) {
  const box = document.getElementById('code-box');
  if (box) box.innerHTML = String(banner('ok', html`Kode kelas ${name}: <strong class="num">${code}</strong>. Catat sekarang. Demi keamanan, kode tidak bisa dilihat lagi.`));
  box?.scrollIntoView({ block: 'center' });
}

function verdictName(k) {
  return { benar: 'Benar', perlu_koreksi: 'Perlu koreksi', salah_berbahaya: 'Salah dan berbahaya', di_luar_kemampuan: 'Di luar kemampuan' }[k];
}

function mergeHard(d) {
  const m = new Map();
  for (const t of d.hard_topics) m.set(t.name, { name: t.name, chat: t.deep, practice: 0 });
  for (const t of d.practice_hard) {
    const x = m.get(t.name) || { name: t.name, chat: 0, practice: 0 };
    x.practice = t.deep;
    m.set(t.name, x);
  }
  return [...m.values()].sort((a, b) => b.chat + b.practice - (a.chat + a.practice));
}
void raw;
