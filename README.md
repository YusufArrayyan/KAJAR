# KAJAR (Kawan Belajar)

Prototipe sistem dari esai IMMSSAC 2026 "Kawan Belajar: Tutor AI Berdaya Rendah dengan Mahasiswa Peninjau". Spesifikasi lengkap ada di [docs/PRD.md](docs/PRD.md).

Isinya satu aplikasi web progresif (PWA) untuk lima peran:

- **Siswa**: tes awal dan akhir, Latihan dengan petunjuk bertahap, Tanya Bebas (chat), Profil.
- **Peninjau mahasiswa**: pelatihan dan kalibrasi, antrean tinjauan dengan rubrik, catatan jam kontribusi.
- **Guru dan koordinator**: ikhtisar kelas, mutu AI, kesehatan program, hasil tes, kelas dan kode, persetujuan, insiden, ekspor CSV.
- **Admin**: bank soal dan materi, versi prompt, aturan antrean, pola keamanan, biaya, log audit.

Status: **prototipe untuk demo dan uji coba terbatas**. Belum dipakai di sekolah, belum ada data hasil. Hal yang wajib diperiksa manusia sebelum pilot ada di [docs/OPEN_ITEMS.md](docs/OPEN_ITEMS.md).

## Menjalankan

Butuh Node.js 22.13 atau lebih baru (diuji di Node 24). Tidak perlu `npm install` untuk mode demo.

```bash
npm start
```

Buka http://localhost:3000. Saat pertama jalan, server membuat basis data demo di `data/kajar.db`. Untuk mengulang data dari awal:

```bash
npm run seed
```

### Akun demo

Semua akun ini fiktif dan hanya untuk demo lokal.

| Peran | Masuk di | Nama atau email | PIN atau kata sandi |
|---|---|---|---|
| Siswa (persetujuan lengkap) | `/masuk` | Rani | 246810 |
| Siswa (persetujuan belum lengkap) | `/masuk` | Dimas | 135790 |
| Peninjau (sudah lulus pelatihan) | `/staf/masuk` | bima@kajar.test | kajar-demo-2026 |
| Peninjau (belum pelatihan) | `/staf/masuk` | ayu@kajar.test | kajar-demo-2026 |
| Guru | `/staf/masuk` | sari@kajar.test | kajar-demo-2026 |
| Koordinator | `/staf/masuk` | lestari@kajar.test | kajar-demo-2026 |
| Admin | `/staf/masuk` | admin@kajar.test | kajar-demo-2026 |

Kode kelas untuk mendaftar sebagai siswa baru: `MATEKX01` (kelas X-1) atau `MATEKX02` (kelas X-2).

### Memakai model AI sungguhan

Secara bawaan tutor memakai penyedia `mock`: jawaban disusun dari materi terkurasi dengan aturan tangga petunjuk, tanpa internet. Untuk memakai Claude:

```bash
npm install
```

Lalu salin `.env.example` menjadi `.env` dan isi `LLM_PROVIDER=anthropic`, `LLM_MODEL`, dan `ANTHROPIC_API_KEY`. Nama model hanya ditulis di `.env`, tidak di kode (PRD 9.5). Bila penyedia gagal, sistem jatuh ke penyedia cadangan (`LLM_FALLBACK_PROVIDER`, bawaan `mock`) dan Latihan tetap berjalan.

## Deploy ke Render

Repo ini sudah berisi Blueprint (`render.yaml`): satu web service Node di region Singapura, paket gratis.

1. Push repo ke GitHub.
2. Di Render: **New → Blueprint**, pilih repo `KAJAR`, lalu **Apply**.
3. Render menanyakan `LLM_MODEL` dan `ANTHROPIC_API_KEY`. Untuk demo mode `mock`, biarkan kosong.
4. Setelah deploy selesai, buka **Environment** di layanan `kajar` dan salin nilai `DEMO_STAFF_PASSWORD`. Itu kata sandi semua akun staf demo di server publik; `kajar-demo-2026` hanya berlaku di laptop.

Catatan paket gratis: layanan tidur setelah sekitar 15 menit tanpa pengunjung, dan pembukaan pertama sesudahnya butuh kira-kira satu menit. Basis data SQLite tidak permanen: setiap deploy atau restart mengulang data demo dari awal. Untuk data yang bertahan, pakai paket berbayar dengan persistent disk (petunjuk ada di bagian bawah `render.yaml`).

## Memeriksa mutu

```bash
npm test
```

37 uji otomatis, masing-masing diberi nama sesuai kriteria penerimaan PRD (F-AUTH, F-CHAT, F-REV, F-SAFE, dan seterusnya).

```bash
npm run eval
```

Set evaluasi AI dari PRD 9.6: 50 permintaan "langsung jawab", 50 pesan uji keamanan, kebenaran solusi terkurasi, dan ketepatan pencarian materi.

```bash
npm run budget
```

Ukuran unduhan dibandingkan anggaran PRD 12.1.

Hasil terakhir (28 Oktober 2026, penyedia `mock`): 37/37 uji lulus; evaluasi 50/50 kepatuhan petunjuk, 50/50 keamanan, 30/30 solusi terkurasi, 9/9 pencarian topik; muat pertama siswa 27,3 KB (batas 120 KB), satu pertukaran chat sekitar 1,1 KB (batas 3 KB).

## Struktur

```
server/            Server Node tanpa dependensi (node:http, node:sqlite)
  index.js         Titik masuk, berkas statis, header keamanan
  db.js            Skema basis data (PRD 10)
  auth.js          Hash PIN, sesi, penguncian
  ai/              Pipeline 10 langkah (PRD 9.1), penyedia model, keamanan, cek hitungan, pencarian materi
  routes/          API per peran (PRD 11)
  content.js       Topik, 30 soal latihan, 30 soal tes, materi, set kalibrasi peninjau
  seed.js          Data demo
public/            Klien PWA tanpa bundler
  js/app.js        Router, pemanggil API, kerangka tampilan
  js/student.js    Layar siswa S2 sampai S12
  js/review.js     Layar peninjau R1 sampai R4
  js/staff.js      Layar guru dan koordinator K1 sampai K9
  js/admin.js      Layar admin A1 sampai A5
  sw.js            Service Worker (offline)
tests/             Uji otomatis
eval/              Set evaluasi AI dan pengukur anggaran
docs/              PRD, sistem desain, arsitektur, hal terbuka
```

Penjelasan keputusan teknis dan selisih dari PRD ada di [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Token warna dan aturan komponen ada di [docs/DESIGN.md](docs/DESIGN.md).
