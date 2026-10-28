# Hal terbuka sebelum pilot

Daftar ini memuat semua yang bertanda [PERLU DIVERIFIKASI] di PRD, ditambah keputusan prototipe yang perlu disetujui manusia. Tidak ada yang diisi dengan tebakan.

## Wajib sebelum dipakai di sekolah

| # | Hal | Posisi di sistem | Siapa yang memeriksa |
|---|---|---|---|
| 1 | Kontak bantuan resmi untuk teks keselamatan | Admin → Keamanan → Kontak bantuan resmi (sekarang placeholder) | Koordinator, dari sumber pemerintah |
| 2 | Dasar hukum data anak, formulir persetujuan wali, tenggat penghapusan data (sekarang 7 hari kerja) | Halaman Persetujuan, Profil siswa | Unit hukum kampus (UU 27/2022, PP 17/2025) |
| 3 | Perjanjian pemrosesan data dengan penyedia model, termasuk larangan melatih model dari data siswa | `.env`, penyedia `anthropic` | Admin dan kampus |
| 4 | Peninjauan 30 soal latihan dan 30 soal tes oleh guru matematika | Admin → Konten. Soal contoh berstatus Terbit hanya untuk demo; ubah ke Draf sebelum pilot. | Guru |
| 5 | Lisensi materi rujukan | Admin → Materi rujukan. Semua materi saat ini ditulis tim sendiri. | Admin |
| 6 | Pemilihan model, harga per token, dan anggaran harian | `.env` dan Admin → Biaya (harga masih kosong) | Admin, dengan set evaluasi |
| 7 | Ambang evaluasi PRD 9.6 dan ambang kepercayaan 0,7 | Admin → Prompt dan Aturan | Koordinator |
| 8 | Bentuk pengakuan jam pengabdian peninjau (SKS atau surat keterangan) | Layar Kontribusi peninjau | LPPM atau program studi |
| 9 | Nama "KAJAR" bebas bentrok merek | | Penulis (PDKI, toko aplikasi) |
| 10 | Konektivitas nyata di sekolah calon pilot | Kolom catatan konektivitas sekolah | Survei lapangan |
| 11 | Periode retensi isi percakapan | Belum ada penghapusan otomatis | Unit hukum kampus |

## Keputusan prototipe yang perlu disetujui

- Hash PIN memakai scrypt, bukan Argon2id atau bcrypt seperti di PRD 12.3. Bila kampus mewajibkan Argon2id, tambah dependensi `argon2` di `server/auth.js`.
- Magic link staf ditulis ke log server karena belum ada layanan email.
- SQLite dipakai sebagai pengganti PostgreSQL; pembatasan akses dilakukan di API, bukan RLS.
- Pola penyaring keamanan masih berbasis daftar kata. Perlu ditinjau guru BK dan diuji dengan bahasa siswa sungguhan, termasuk singkatan dan bahasa daerah. Pola "mati aja" bisa memicu positif palsu.
- Penyedia `mock` hanya menyusun petunjuk dari materi contoh, tidak menyelesaikan angka di soal siswa. Uji kualitas tutor yang sebenarnya butuh model sungguhan.
- Seed membuat 22 siswa sintetis dan aktivitas palsu supaya dasbor tidak kosong saat demo. Semua layar dasbor menandainya sebagai "Data contoh". Sebelum pilot, jalankan `node server/seed.js --reset --tanpa-demo`.

## Belum diukur

- Waktu sampai bisa mengetik di 3G lambat dan skor Lighthouse di ponsel Android entry-level.
- Penilaian bahasa (50 pertanyaan, dinilai peninjau) dan set 100 soal kebenaran untuk model sungguhan.
- Uji dengan pembaca layar (TalkBack).
- Uji penetrasi dasar dan pemindaian dependensi.
