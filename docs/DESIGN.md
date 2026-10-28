# Sistem desain KAJAR

Sumber: token PRD 7.2, warna logo KAJAR, dan tata letak ala Intercom (dari pustaka awesome-design-md): kanvas krem hangat, kartu putih bergaris tipis, tanpa bayangan, satu warna aksen untuk aksi. Semua token hidup di `public/css/app.css`.

## Mengapa warna berbeda dari PRD 7.2

PRD memakai hijau `#0E7C66` sebagai warna utama. Logo final memakai biru dan kuning, jadi warna utama dipindah ke biru logo. Hijau PRD tidak dibuang: ia menjadi warna **catatan peninjau manusia**, sehingga koreksi manusia tetap tampil berbeda dari jawaban AI (PRD 7.1 butir 4). Kuning logo dipakai untuk hiasan logo saja; teks petunjuk memakai oranye tua agar kontrasnya cukup.

## Token warna

| Token | Terang | Gelap | Pemakaian |
|---|---|---|---|
| `--bg` | `#FBF8F3` | `#0F1420` | Latar halaman |
| `--surface` | `#FFFFFF` | `#182031` | Kartu, input |
| `--ink` | `#1F2937` | `#E6EBF5` | Teks utama |
| `--ink-soft` | `#4B5563` | `#AEB8CB` | Teks sekunder |
| `--line` | `#E5E0D6` | `#2A3447` | Garis pemisah |
| `--primary` | `#1D4ED8` | `#8DB4FF` | Aksi utama, gelembung siswa |
| `--brand-navy` | `#1C46B2` | | Toga di logo |
| `--brand-yellow` | `#F9B115` | | Huruf K di logo, hiasan saja |
| `--hint` | `#B45309` | `#F5B454` | Tangga petunjuk L1 sampai L4 |
| `--review` | `#0B6F5C` | `#4FD1B0` | Catatan peninjau manusia |
| `--danger` | `#B42318` | `#FF8A80` | Galat, vonis berbahaya |
| `--ok` | `#137236` | `#7EE2A0` | Vonis benar, sukses |
| `--chart-1` / `--chart-2` | `#2563EB` / `#D97706` | `#5B8DEF` / `#C98420` | Dua seri grafik (tes awal, tes akhir) |

Setiap pasangan teks dan latarnya (termasuk `--hint` di atas `--hint-soft` dan seterusnya) sudah dicek minimal 4,5:1 (WCAG 2.2 AA). Palet grafik lolos validator palet (pita kecerahan, pemisahan buta warna) di kedua tema.

## Tipografi dan ruang

- Huruf: `system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif`. Tanpa unduhan font.
- Ukuran: body 16 px, keterangan 14 px, H2 20 px, H1 24 px, tinggi baris 1,5. Judul memakai berat 600 sampai 650 dan spasi huruf sedikit rapat.
- Ukuran teks mengikuti perangkat; Profil menyediakan Normal, Besar (112,5%), Sangat besar (125%).
- Jarak skala 4 px: 4, 8, 12, 16, 24, 32.
- Sudut: 12 px kartu dan gelembung, 8 px tombol dan input, 999 px chip.
- Tanpa bayangan. Kedalaman dari perpindahan krem ke putih dan garis `--line`.
- Gerak maksimal 120 ms, mati total di Mode Hemat Data dan untuk `prefers-reduced-motion`.

## Komponen (PRD 7.3)

| Komponen | Kelas CSS | Catatan |
|---|---|---|
| Button | `.btn`, `.secondary`, `.ghost`, `.danger`, `.small` | Tinggi minimal 48 px (44 px versi kecil). Status memuat berupa teks ("Mengirim…"). |
| ChatBubble | `.bubble.student/.ai/.reviewer/.system` | AI selalu berlabel "Jawaban AI" + peringatan; peninjau bergaris kiri hijau dan label "Catatan dari Kak …". |
| HintChip | `.chip.hint` | "Petunjuk 2 dari 4". |
| TopicTag | `.chip.topic` | Nama topik rujukan. |
| FeedbackRow | `.feedback` | Membantu, Membingungkan, Salah, Tanya Kakak Mahasiswa. |
| OfflineBanner | `.offline-bar` | "Sinyal hilang. Pesanmu disimpan dan dikirim nanti." |
| ProgressBar | `.meter` | Empat ruas, selalu disertai teks tingkat penguasaan. |
| VerdictBadge | `.chip.ok/.warn/.danger` | Selalu berteks, tidak hanya warna. |
| DataTable | `table.responsive` | Menjadi kartu di layar sempit. |
| EmptyState | `.empty` | Satu kalimat + satu aksi. |
| ConfirmDialog | `confirmDialog()` | Untuk tindakan yang tidak bisa dibatalkan; tombol menyebut aksinya. |

## Grafik

Batang tipis dengan ujung data membulat 4 px, garis kisi samar, tooltip saat disentuh, dan **selalu ada tabel pendamping** ("Lihat tabel data"). Dua seri memakai legenda; vonis memakai warna status yang juga diberi label.

## Bahasa antarmuka

Sapaan **kamu** untuk siswa, sesuai PRD. Layar staf memakai kalimat perintah tanpa sapaan. Istilah tetap: Masuk, Daftar, Keluar, Simpan, Kirim, Coba lagi. Pesan galat selalu menyebut cara keluar dari masalah. Judul memakai huruf kapital di awal kalimat saja (EYD), bukan Title Case.

## Pembaruan tampilan: aplikasi belajar terang dan modern (28 Oktober 2026)

Atas permintaan penulis, tampilan siswa dibuat terasa seperti aplikasi belajar populer, lalu dipoles dengan skill desain *impeccable*. Prinsipnya: terang, tenang, jelas; warna hanya bila punya arti. Tetap tanpa gambar bitmap dan font unduhan.

- **Tema terang selalu bawaan.** Tema gelap atau "ikuti ponsel" hanya berlaku bila siswa memilihnya di Profil (kunci `kajar-tema-pilihan`). Preferensi lama yang tersimpan otomatis oleh versi sebelumnya diabaikan. Ini menyimpang dari PRD 7.2 ("mengikuti sistem").
- **Token:** latar `#F5F7FB` (abu sangat terang berona biru, bukan krem), kartu putih, tinta `#0F172A`, tinta lembut `#475569`. Radius 10/16/24 px, bayangan dua lapis sangat tipis (hilang di tema gelap; PRD 7.2 awalnya meniadakan bayangan). Gerak 180 ms ease-out, mati di Mode Hemat Data. Skala z-index bernama.
- **Beranda:** pita biru polos dengan sapaan dan satu bilah kemajuan kuning ("Topik yang sudah kamu kuasai"), menu cepat empat ikon, kartu Lanjutkan belajar, kartu Tanya, daftar Disarankan, Catatan dari Kakak.
- **Daftar topik berbaris** (ikon glyph, nama, penguasaan, sisa soal, panah) dipakai di Beranda, Latihan, catatan peninjau, dan panel juri. Lebih mudah dipindai daripada kisi kartu seragam.
- **Glyph topik** `aⁿ`, `log`, `+b`, `×r`, `Σ`, `xyz`, `x²`, `sin`, `x̄` dengan warna `--t1` sampai `--t9`; nama topik selalu tertulis.
- **Tanpa garis tebal di tepi kiri kartu.** Catatan peninjau, kotak petunjuk, dan banner memakai latar berwarna dengan garis penuh tipis.
- Kontras semua pasangan teks dan latar lolos WCAG AA (terkecil 4,61:1 untuk teks petunjuk). Detektor desain *impeccable*: 0 temuan.
