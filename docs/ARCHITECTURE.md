# Arsitektur dan selisih dari PRD

## Pilihan teknis

| Lapisan | PRD 16 mengusulkan | Prototipe ini memakai | Alasan |
|---|---|---|---|
| Aplikasi | Next.js + TypeScript | Node `node:http` + JavaScript modul, klien tanpa bundler | Anggaran muat pertama 120 KB. Hasilnya 27 KB, dan proyek bisa dijalankan tanpa `npm install`. |
| Basis data | PostgreSQL + pgvector | SQLite bawaan Node (`node:sqlite`) | Tanpa server basis data untuk demo. Skema tabel mengikuti PRD 10, jadi pindah ke PostgreSQL berarti menulis ulang `server/db.js` saja. |
| RLS | Row Level Security PostgreSQL | Pembatasan akses di setiap rute API | SQLite tidak punya RLS. Aturannya sama: siswa hanya datanya sendiri, peninjau hanya item antrean tanpa identitas, guru melihat agregat, admin tidak membaca percakapan. |
| Pencarian materi | Vektor (pgvector) | BM25 leksikal + kata kunci topik | Tanpa model embedding dan tanpa internet. Antarmuka `embed()` sudah ada di `LLMProvider` untuk penggantian nanti. |
| Validasi | Zod | Validator kecil `check()` di `server/http.js` | Tanpa dependensi. |
| Hash PIN | Argon2id atau bcrypt | scrypt (N=2^15) dari `node:crypto` | Node tidak punya Argon2 bawaan. scrypt juga memory-hard. |
| Magic link | Kirim email | Tautan ditulis ke log server | Belum ada layanan email. |
| Pekerjaan latar | pg-boss atau cron | `setInterval` 15 menit untuk peringatan antrean | Cukup untuk satu server pilot. |

## Alur satu pesan (PRD 9.1)

`server/ai/pipeline.js` menjalankan langkah [1] sampai [10] secara berurutan:

1. Normalisasi dan penyamaran data pribadi (`redactPII`) sebelum apa pun disimpan.
2. Penyaring keamanan. Risiko tinggi: balasan aman, kejadian keselamatan, notifikasi guru dan koordinator, item hanya untuk orang dewasa. Berhenti.
3. Pengarah niat: belajar, minta petunjuk, minta jawaban langsung, minta langkah lengkap, di luar belajar.
4. Pencarian materi, top-k 4, dengan topik percakapan sebagai jangkar untuk pesan pendek seperti "4".
5. Tingkat petunjuk (`nextHintLevel`). L4 hanya setelah siswa mencoba.
6. Pembangkitan jawaban lewat `LLMProvider` dengan prompt sistem dari basis data. Materi dan pesan siswa dibungkus tag dan diperlakukan sebagai data.
7. Verifikasi hitungan deterministik (`verifyClaims`). Model sungguhan diminta mengulang sekali bila ada selisih; bila masih selisih, item ditandai.
8. Skor kepercayaan dari model; di bawah ambang diberi label "kurang yakin" dan masuk antrean.
9. Penyaring keluaran: jawaban akhir sebelum L4, kata terlarang, jawaban kosong, panjang lebih dari 150 kata.
10. Aturan antrean PRD 9.4, termasuk sampel acak dan 5% item ditinjau dua orang.

Penyedia `anthropic` memakai SDK resmi `@anthropic-ai/sdk` (dependensi opsional) dengan keluaran terstruktur JSON Schema, `effort: low`, dan `fallbacks: "default"` di sisi server untuk penolakan model. Penolakan tetap ditangani: siswa menerima pesan "kurang yakin" dan item masuk antrean.

## Offline dan hemat data

- Service Worker menyimpan cangkang aplikasi dan versi terakhir dari daftar topik, soal latihan, dan soal tes. Nama cache diberi cap hash isi `public/`, jadi setiap pembaruan berkas mengganti cache.
- Pesan yang diketik tanpa sinyal masuk IndexedDB (`outbox`) dengan `client_msg_id`. Server mengabaikan duplikat, sehingga kirim ulang aman. Urutan pesan terjaga karena antrean dikirim berurutan.
- Jawaban tes disimpan di ponsel setiap kali dipilih dan disinkronkan ke server bila ada sinyal.
- Riwayat percakapan terakhir disalin ke IndexedDB untuk dibaca saat offline.
- Penghitung data di Profil menjumlahkan `transferSize` dari Performance API per minggu.

## Kepatuhan terhadap kriteria penerimaan

Status per kebutuhan, berdasarkan `npm test` dan `npm run eval`:

| Kebutuhan | Status |
|---|---|
| F-AUTH-1 sampai 4 | Terpenuhi dan diuji. Magic link tanpa email (log server). |
| F-CONS-1 sampai 3 | Terpenuhi dan diuji. Unggah berkas bukti persetujuan belum ada; yang ada catatan teks. |
| F-ASSESS-1 sampai 4 | Terpenuhi dan diuji. |
| F-PRAC-1 sampai 4 | Terpenuhi. F-PRAC-1 status soal diuji; soal contoh diterbitkan untuk demo dan wajib ditinjau guru. |
| F-CHAT-1 sampai 8 | Terpenuhi dan diuji dengan penyedia mock. Kualitas bahasa model sungguhan belum diuji. |
| F-LOW-1 sampai 5 | Terpenuhi. F-LOW-2 diuji di peramban dengan jaringan diputus buatan; belum di ponsel sungguhan. |
| F-REV-1 sampai 9 | Terpenuhi dan diuji. |
| F-DASH-1 sampai 6 | Terpenuhi. Laporan PDF lewat fitur cetak peramban. |
| F-ADM-1 sampai 5 | Terpenuhi. Kelola pengguna terbatas pada undang peninjau dan atur ulang PIN; belum ada kelola sekolah lebih dari satu. |
| F-SAFE-1 sampai 4 | Terpenuhi dan diuji. Daftar pola masih sederhana dan perlu diperluas bersama guru BK. |
| PRD 12.1 ukuran | Lulus (`npm run budget`). Waktu muat di 3G dan Lighthouse belum diukur. |
| PRD 12.5 aksesibilitas | Kontras token lulus AA. Belum diuji dengan pembaca layar sungguhan. |
