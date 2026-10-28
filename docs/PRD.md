# PRD — KAJAR

**Sistem tutor AI berbasis chat, berdaya rendah, dengan peninjauan oleh mahasiswa**

| Item | Isi |
|---|---|
| Versi | 1.0 (draf untuk dibangun di Claude Code) |
| Tanggal | 28 Oktober 2026 |
| Pemilik produk | Penulis esai (mahasiswa S1 Teknik Informatika, Universitas Bengkulu) |
| Status | Usulan. Belum dibangun, belum diuji, belum ada data hasil. |
| Kaitan | Dasar sistem dari esai lomba IMMSSAC 2026, "Kawan Belajar: Tutor AI Berdaya Rendah dengan Mahasiswa Peninjau" |
| Bahasa produk | Indonesia (baku-santai, ramah pelajar SMA) |

> **Cara memakai dokumen ini di Claude Code.** Taruh file ini sebagai `docs/PRD.md` di repositori kosong. Mulai dari bagian 17 ("Panduan membangun di Claude Code"), lalu kerjakan milestone M0 sampai M6 berurutan. Semua hal yang bertanda **[PERLU DIVERIFIKASI]** harus dicek manusia sebelum dipakai di sekolah sungguhan (hukum, lisensi konten, biaya, dan angka).

---

## 1. Ringkasan

**KAJAR** (singkatan dari Kawan Belajar) adalah aplikasi web progresif (PWA) berbasis teks yang menjadi tutor belajar untuk pelajar SMA. Ada tiga bagian yang saling terkait:

1. **Tutor AI hemat data.** Pelajar bertanya dan berlatih lewat antarmuka chat yang sangat ringan, tanpa gambar, tanpa video, tanpa font tambahan, dan tetap berguna saat koneksi putus-sambung.
2. **Lapisan peninjau mahasiswa.** Mahasiswa (terutama informatika dan pendidikan) memeriksa jawaban AI yang ditandai bermasalah ditambah sampel acak, lalu mengoreksi sebelum atau sesudah sampai ke pelajar.
3. **Pengukuran.** Tes awal dan tes akhir, aktivitas belajar, akurasi jawaban AI menurut peninjau, dan keberlanjutan program dilaporkan ke koordinator (dosen pembimbing lapangan atau guru).

Sistem ini dirancang untuk **pilot satu semester di beberapa SMA di Bengkulu** lewat jalur pengabdian kampus. Ia tidak dirancang sebagai pengganti guru.

### 1.1 Mengapa ada (ringkas dari esai)

- Akses internet belum merata antarwilayah dan antara kota dan desa (data BPS dan APJII, lihat esai untuk angka dan sumber terverifikasi).
- Bantuan belajar personal sulit didapat pelajar yang tidak punya pendamping.
- Solusi AI pendidikan pemerintah yang ditemukan penulis menyasar guru dan, menurut satu laporan berita, butuh internet cepat **[PERLU DIVERIFIKASI ke rilis resmi]**.
- Bukti awal dari luar negeri: tutor chat via WhatsApp di Ghana meningkatkan skor matematika (Henkel dkk., 2024); AI tanpa pengaman dapat merugikan belajar (Bastani dkk., 2025); tutor dengan desain pedagogis dan solusi tertulis bisa unggul (Kestin dkk., 2025).

### 1.2 Yang tidak boleh diklaim dari PRD ini

Tidak ada bukti bahwa sistem ini berhasil di Indonesia. Semua target di dokumen ini adalah **hipotesis pilot**, bukan janji hasil.

---

## 2. Tujuan dan non-tujuan

### 2.1 Tujuan produk

| ID | Tujuan | Cara mengukur (pilot satu semester) |
|---|---|---|
| G1 | Pelajar di daerah berkoneksi terbatas bisa mendapat bantuan belajar personal lewat ponsel biasa. | Persentase sesi yang berhasil dengan jaringan lambat; waktu muat pertama; konsumsi data per sesi |
| G2 | Jawaban AI cukup benar dan aman untuk dipakai belajar. | Persentase jawaban yang dinilai "Benar" oleh peninjau pada sampel; jumlah insiden keamanan |
| G3 | Pelajar benar-benar belajar, bukan menyalin jawaban. | Rasio petunjuk bertahap vs jawaban langsung; selisih skor tes awal dan akhir; keterlibatan mingguan |
| G4 | Program bisa berjalan dengan struktur kampus yang sudah ada. | Jumlah peninjau aktif per periode; retensi peninjau antarperiode; beban kerja peninjau |
| G5 | Koordinator bisa memantau mutu dan hasil tanpa menjadi analis data. | Waktu menyusun laporan; kelengkapan data laporan |

### 2.2 Non-tujuan (MVP)

- Bukan pengganti guru, bukan penilaian resmi sekolah, bukan pemberi nilai rapor.
- Bukan media sosial; tidak ada chat antarsiswa.
- Bukan konseling. Untuk topik emosional, sistem hanya mengarahkan ke orang dewasa tepercaya dan sumber bantuan resmi.
- Tidak ada pembayaran, iklan, atau penjualan data.
- Tidak ada aplikasi native di MVP (PWA saja). Kanal WhatsApp atau Telegram masuk fase berikutnya.

---

## 3. Pengguna dan persona

| Persona | Peran sistem | Kebutuhan utama | Kendala |
|---|---|---|---|
| **Rani, 16 tahun, siswi kelas X SMA** | `student` | Penjelasan sabar, latihan, tidak malu bertanya | Kuota terbatas, sinyal naik-turun, ponsel Android entry-level, mungkin berbagi ponsel dengan keluarga |
| **Bima, 20 tahun, mahasiswa Informatika semester 6** | `reviewer` | Tugas peninjauan jelas, dihargai sebagai pengabdian, tidak memakan waktu kuliah | Waktu terbatas, belum tentu menguasai semua materi SMA |
| **Bu Sari, guru matematika SMA** | `teacher` | Tahu siswa mana yang butuh bantuan, tahu AI mengajarkan apa | Waktu terbatas, kurang yakin dengan AI |
| **Dr. Lestari, dosen pembimbing lapangan (DPL)** | `coordinator` | Memantau mutu, melaporkan capaian ke kampus | Perlu data ringkas, bukan log mentah |
| **Admin teknis pilot** | `admin` | Mengelola sekolah, konten, prompt, dan keamanan | Satu orang, sumber daya terbatas |

---

## 4. Ruang lingkup

### 4.1 MVP (wajib ada saat pilot)

- Pendaftaran siswa dengan kode kelas (tanpa email dan tanpa nomor telepon).
- Persetujuan sekolah dan orang tua tercatat.
- Tes awal dan tes akhir Matematika Fase E (kelas X).
- Mode **Latihan** (soal terkurasi dengan solusi bertahap) dan mode **Tanya Bebas**.
- Tangga petunjuk (hint ladder) dan penjaga jawaban langsung.
- Mode Hemat Data, antrean pesan saat offline, riwayat lokal.
- Antrean peninjau, penilaian dengan rubrik, koreksi yang sampai ke siswa.
- Dasbor koordinator dan guru, ekspor laporan CSV.
- Panel admin: sekolah, kelas, konten soal, versi prompt, log audit.
- Penyaring keamanan dan eskalasi.

### 4.2 Fase 2 (setelah pilot)

- Mata pelajaran lain (Fisika, Informatika, Bahasa Indonesia literasi).
- Kanal Telegram atau WhatsApp **[PERLU DIVERIFIKASI: biaya, kebijakan penggunaan bot pendidikan, dan persetujuan data]**.
- Mode offline penuh dengan model kecil di perangkat (rujukan konsep: Hevia dkk., 2025, belum ada hasil evaluasi di abstraknya).
- Dukungan bahasa daerah.
- Verifikasi matematika simbolik yang lebih luas.

### 4.3 Di luar jangkauan

Aplikasi native, pembayaran, gamifikasi kompetitif antarsekolah, fitur sosial, analitik pihak ketiga.

---

## 5. Kebutuhan fungsional

Prioritas: **P0** wajib MVP, **P1** sebaiknya MVP, **P2** fase 2.

### 5.1 Akun, onboarding, dan persetujuan

| ID | Kebutuhan | Prio | Kriteria penerimaan |
|---|---|---|---|
| F-AUTH-1 | Koordinator membuat sekolah dan kelas; setiap kelas punya kode 8 karakter yang bisa dinonaktifkan. | P0 | Kode unik, tidak mudah ditebak, bisa dicabut; log audit tercatat |
| F-AUTH-2 | Siswa mendaftar dengan kode kelas, nama panggilan, dan PIN 6 angka. Tidak ada email, nomor telepon, atau nama lengkap. | P0 | Akun terbentuk dalam ≤3 langkah; PIN disimpan sebagai hash kuat; salah PIN 5 kali mengunci 15 menit |
| F-AUTH-3 | Siswa bisa lupa PIN: koordinator atau guru mengatur ulang lewat panel. | P0 | Tidak ada pemulihan otomatis lewat email |
| F-AUTH-4 | Peninjau, guru, koordinator, admin masuk dengan email dan tautan sekali pakai (magic link) atau sandi. | P0 | Peran dibatasi RBAC; sesi kedaluwarsa 7 hari |
| F-CONS-1 | Sebelum siswa memakai Tanya Bebas, sistem memeriksa bahwa persetujuan sekolah dan orang tua untuk kelas itu sudah dicatat koordinator. | P0 | Tanpa catatan persetujuan, siswa hanya melihat halaman "Menunggu persetujuan" |
| F-CONS-2 | Siswa melihat penjelasan singkat: apa yang disimpan, siapa yang bisa melihat (peninjau melihat percakapan tanpa nama), dan bahwa jawaban AI bisa salah. | P0 | Ditampilkan sekali saat pertama dan bisa dibuka lagi dari Profil |
| F-CONS-3 | Siswa atau wali dapat meminta penghapusan data lewat koordinator. | P0 | Penghapusan lengkap dalam ≤7 hari kerja; tercatat di log audit **[PERLU DIVERIFIKASI: tenggat menurut UU PDP]** |

### 5.2 Tes awal dan akhir

| ID | Kebutuhan | Prio | Kriteria penerimaan |
|---|---|---|---|
| F-ASSESS-1 | Tes awal 15 soal pilihan ganda dan isian singkat, Matematika Fase E, tanpa batas waktu keras, dapat dilanjutkan jika terputus. | P0 | Jawaban tersimpan lokal dan disinkronkan; tidak ada kehilangan data saat sinyal hilang |
| F-ASSESS-2 | Tes akhir memakai soal ekuivalen (bank soal berbeda, tingkat kesulitan serupa). | P0 | Kedua tes dipetakan ke topik yang sama |
| F-ASSESS-3 | Hasil tes tidak dipakai sebagai nilai sekolah; siswa hanya melihat ringkasan topik kuat dan topik perlu latihan. | P0 | Teks penjelasan di layar hasil |
| F-ASSESS-4 | Koordinator melihat skor awal dan akhir per kelas dan, bila perlu, per siswa pseudonim. | P0 | Ekspor CSV dengan ID pseudonim saja |

### 5.3 Mode Latihan (soal terkurasi)

| ID | Kebutuhan | Prio | Kriteria penerimaan |
|---|---|---|---|
| F-PRAC-1 | Bank soal terkurasi per topik, tiap soal punya solusi bertahap tertulis dan ditinjau oleh peninjau atau guru. | P0 | Soal berstatus `draft` → `ditinjau` → `terbit`; hanya `terbit` tampil ke siswa |
| F-PRAC-2 | Siswa mencoba dulu; tutor menilai jawaban dan memberi petunjuk berjenjang berdasarkan solusi tertulis. | P0 | Tidak ada solusi lengkap sebelum siswa mencoba atau meminta bantuan dua kali |
| F-PRAC-3 | Pelacakan penguasaan sederhana per topik (belum, mulai, cukup, kuat) dari hasil latihan. | P1 | Berdasarkan aturan transparan yang bisa dijelaskan ke siswa |
| F-PRAC-4 | Rekomendasi latihan berikutnya berdasarkan tes awal. | P1 | Maksimal 3 rekomendasi, bukan daftar panjang |

### 5.4 Mode Tanya Bebas (chat)

| ID | Kebutuhan | Prio | Kriteria penerimaan |
|---|---|---|---|
| F-CHAT-1 | Siswa mengetik pertanyaan teks; tutor menjawab dalam bahasa Indonesia sederhana. | P0 | Panjang jawaban default ≤150 kata |
| F-CHAT-2 | Tutor memakai **tangga petunjuk**: L1 pertanyaan penuntun, L2 petunjuk konsep, L3 langkah sebagian, L4 langkah lengkap dengan penjelasan. L4 hanya setelah siswa mencoba atau meminta petunjuk berulang. | P0 | Uji otomatis: 50 permintaan "langsung jawab saja" tidak menghasilkan jawaban akhir pada percobaan pertama |
| F-CHAT-3 | Pencarian materi: jawaban berpegang pada materi kurikulum yang diindeks (RAG) dan menyebut topik rujukannya. | P0 | Setiap jawaban menyertakan label topik; di luar materi, tutor mengatakan tidak yakin |
| F-CHAT-4 | Tombol **"Tanya Kakak Mahasiswa"** untuk meminta bantuan manusia pada pesan tertentu. | P0 | Pesan masuk antrean prioritas peninjau |
| F-CHAT-5 | Tombol "Jawaban ini membingungkan" dan "Jawaban ini salah" (umpan balik cepat). | P0 | Keduanya otomatis menandai pesan untuk peninjauan |
| F-CHAT-6 | Verifikasi hitungan dengan alat deterministik (aritmetika dan aljabar dasar) sebelum jawaban dikirim. | P1 | Jika hasil alat berbeda dengan jawaban model, jawaban ditandai dan model diminta mengulang |
| F-CHAT-7 | Pengalihan topik: pertanyaan di luar belajar ditolak halus dan diarahkan kembali. | P0 | Daftar kategori ditolak ada di admin |
| F-CHAT-8 | Batas pemakaian harian per siswa (default 30 pesan) agar biaya terkontrol. | P0 | Saat habis, tampil pesan ramah dan tombol buka Latihan |

### 5.5 Hemat data dan jaringan lemah

| ID | Kebutuhan | Prio | Kriteria penerimaan |
|---|---|---|---|
| F-LOW-1 | **Mode Hemat Data** aktif secara default: tanpa animasi, tanpa streaming, satu permintaan satu balasan, riwayat dimuat paginasi kecil. | P0 | Lihat anggaran performa di bagian 12 |
| F-LOW-2 | Antrean keluar (outbox): pesan yang diketik saat offline tersimpan di perangkat dan dikirim otomatis ketika online. | P0 | Indikator status "Menunggu sinyal"; urutan pesan terjaga |
| F-LOW-3 | Cache materi Latihan terakhir sehingga siswa bisa membaca soal dan solusi yang sudah diunduh saat offline. | P1 | Maksimal 2 MB tersimpan di perangkat |
| F-LOW-4 | Penghitung kasar data terpakai per sesi dan per minggu (perkiraan). | P1 | Ditampilkan di Profil |
| F-LOW-5 | Pemulihan: bila permintaan gagal, tombol "Coba lagi" tanpa mengetik ulang. | P0 | Draf tidak hilang |

### 5.6 Antrean peninjau (mahasiswa)

| ID | Kebutuhan | Prio | Kriteria penerimaan |
|---|---|---|---|
| F-REV-1 | Sistem memasukkan pesan ke antrean peninjau bila: (a) kepercayaan model rendah, (b) siswa menandai, (c) tombol Tanya Kakak, (d) pemicu keamanan, (e) **sampel acak 10%** dari sisanya (angka bisa diubah admin). | P0 | Aturan terdokumentasi dan bisa dikonfigurasi |
| F-REV-2 | Peninjau melihat percakapan tanpa nama siswa, dengan rujukan topik, jawaban AI, dan konteks 6 pesan terakhir. | P0 | Tidak ada data pribadi di layar peninjau |
| F-REV-3 | Peninjau menilai dengan rubrik empat butir (kebenaran, kejelasan, kesesuaian tingkat, keamanan) dan memilih vonis: **Benar**, **Perlu koreksi**, **Salah dan berbahaya**, **Di luar kemampuan saya**. | P0 | Semua butir wajib; vonis tersimpan dengan waktu pengerjaan |
| F-REV-4 | Jika perlu koreksi, peninjau menulis catatan singkat; catatan tampil ke siswa sebagai "Catatan dari Kak [nama panggilan peninjau]" dalam ≤24 jam (target SLA). | P0 | Pesan koreksi ditandai berbeda dari pesan AI |
| F-REV-5 | Jawaban dengan vonis "Salah dan berbahaya" otomatis dicabut dari tampilan siswa dan diganti pesan pemberitahuan. | P0 | Tercatat di log keamanan |
| F-REV-6 | Peninjau baru wajib lulus pelatihan 30 menit (materi dan 10 soal kalibrasi) sebelum menerima antrean sungguhan. | P0 | Skor lulus ≥80% **(ambang bisa diubah koordinator)** |
| F-REV-7 | Kalibrasi berkala: sebagian item antrean (5%) ditinjau oleh dua peninjau; ketidaksepakatan dikirim ke koordinator. | P1 | Laporan kesepakatan antarpeninjau |
| F-REV-8 | Catatan jam kontribusi peninjau untuk surat keterangan pengabdian. | P1 | Ekspor ringkasan jam per peninjau; **bentuk pengakuan SKS ditentukan kampus [PERLU DIVERIFIKASI]** |
| F-REV-9 | Eskalasi: peninjau bisa meneruskan ke guru atau koordinator. | P0 | Penerima mendapat notifikasi di dasbor |

### 5.7 Dasbor guru dan koordinator

| ID | Kebutuhan | Prio | Kriteria penerimaan |
|---|---|---|---|
| F-DASH-1 | Ikhtisar kelas: siswa aktif mingguan, topik paling sering ditanyakan, topik dengan banyak petunjuk L3 dan L4 (tanda kesulitan). | P0 | Data per kelas, bukan per nama |
| F-DASH-2 | Mutu AI: persentase vonis Benar, Perlu koreksi, Salah; tren mingguan; contoh tanpa nama untuk dibahas. | P0 | Filter minggu dan topik |
| F-DASH-3 | Kesehatan program: jumlah peninjau aktif, waktu tunggu antrean median, jumlah item tertunda >24 jam. | P0 | Peringatan bila antrean menumpuk |
| F-DASH-4 | Hasil tes awal dan akhir, dengan pembanding kelas bila koordinator mendefinisikan kelompok pembanding. | P0 | Penjelasan keterbatasan inferensi di layar |
| F-DASH-5 | Ekspor CSV pseudonim, dan laporan ringkas PDF atau cetak. | P1 | Tanpa nama dan tanpa isi percakapan |
| F-DASH-6 | Panel persetujuan: unggah atau catat status persetujuan sekolah dan wali per kelas. | P0 | Siswa baru tidak bisa memakai Tanya Bebas sebelum tercatat |

### 5.8 Panel admin

| ID | Kebutuhan | Prio | Kriteria penerimaan |
|---|---|---|---|
| F-ADM-1 | Kelola sekolah, kelas, pengguna, peran. | P0 | Semua perubahan masuk log audit |
| F-ADM-2 | Kelola bank soal dan materi (impor CSV atau Markdown), status draf sampai terbit. | P0 | Validasi format sebelum terbit |
| F-ADM-3 | Kelola versi prompt sistem, aturan tangga petunjuk, daftar topik ditolak, sampel acak, batas harian. | P0 | Setiap perubahan punya versi dan bisa dikembalikan |
| F-ADM-4 | Kelola pemicu keamanan dan teks bantuan darurat. | P0 | Teks kontak bantuan diisi dari sumber resmi **[ISI SETELAH DIVERIFIKASI]** |
| F-ADM-5 | Lihat biaya penggunaan model per hari dan per kelas. | P1 | Peringatan bila melewati anggaran |

### 5.9 Keamanan dan eskalasi

| ID | Kebutuhan | Prio | Kriteria penerimaan |
|---|---|---|---|
| F-SAFE-1 | Penyaring masukan: kata atau pola terkait menyakiti diri, kekerasan, eksploitasi, data pribadi (nomor telepon, alamat). | P0 | Pesan terkait tidak dijawab seperti biasa; pesan pendamping yang aman dan arahan ke orang dewasa |
| F-SAFE-2 | Penyaring keluaran: jawaban diperiksa terhadap daftar aturan sebelum dikirim. | P0 | Jawaban yang melanggar diganti pesan aman dan ditandai |
| F-SAFE-3 | Peringatan data pribadi: jika siswa mengetik data pribadi, tutor mengingatkan dan data disamarkan dalam log. | P0 | Penyamaran pada nomor telepon dan pola alamat |
| F-SAFE-4 | Eskalasi keselamatan: kejadian risiko tinggi memberi notifikasi segera ke guru atau koordinator yang ditunjuk dan mengunci pesan dari antrean peninjau mahasiswa (hanya orang dewasa yang melihat). | P0 | Prosedur tertulis dan diuji sebelum pilot |

---

## 6. Alur utama

### 6.1 Alur siswa (inti)

```
Buka PWA → Masuk (kode kelas / PIN) → [pertama kali] Penjelasan data + Tes Awal
→ Beranda → pilih "Latihan" atau "Tanya Bebas"
   Latihan: soal → siswa mencoba → jawaban dinilai → petunjuk L1..L4 → soal berikutnya
   Tanya Bebas: ketik → (kirim | antre bila offline) → pemeriksaan keamanan → pencarian materi
                → AI menjawab (maks. 150 kata, tangga petunjuk) → label topik + tombol umpan balik
→ [bila ditandai / disampel] Peninjau menilai → koreksi muncul sebagai "Catatan dari Kak …"
→ Akhir semester: Tes Akhir
```

### 6.2 Alur peninjau

```
Masuk → Pelatihan + kalibrasi (sekali) → Antrean → buka item → baca konteks
→ nilai rubrik → pilih vonis → (tulis koreksi) → kirim → item berikut
→ Ringkasan jam kontribusi tiap minggu
```

### 6.3 Alur keselamatan

```
Pesan siswa → penyaring masukan → [risiko tinggi] → balasan aman + arahan orang dewasa
→ notifikasi guru/koordinator (bukan peninjau mahasiswa) → catatan insiden → tindak lanjut manusia
```

### 6.4 Status pesan AI

`dibuat` → `lolos keamanan` → `terkirim ke siswa` → (`ditandai`) → `dalam antrean` → `ditinjau: benar | dikoreksi | dicabut`.

---

## 7. Sistem desain dan prinsip tampilan

### 7.1 Prinsip

1. **Teks dulu.** Tanpa gambar dekoratif, ikon berupa SVG inline kecil, tanpa font eksternal, tanpa video.
2. **Mulai dari layar 360 px**, satu tangan, ibu jari menjangkau aksi utama di bawah layar.
3. **Tenang dan tidak menekan.** Tidak ada hitungan mundur, tidak ada streak yang menghukum, tidak ada peringkat antarsiswa.
4. **Jujur soal AI.** Setiap jawaban AI diberi label "Jawaban AI" dan peringatan kecil bahwa bisa salah. Koreksi manusia diberi tampilan berbeda.
5. **Gagal dengan baik.** Setiap layar punya keadaan kosong, memuat, galat, dan offline.
6. **Ramah akses.** Kontras sesuai WCAG 2.2 AA, target sentuh ≥44 px, bisa dipakai dengan pembaca layar, ukuran teks mengikuti pengaturan perangkat.

### 7.2 Token desain (CSS variables)

| Token | Terang | Gelap | Pemakaian |
|---|---|---|---|
| `--bg` | `#FBF8F3` | `#121714` | Latar halaman |
| `--surface` | `#FFFFFF` | `#1B2420` | Kartu, input |
| `--ink` | `#1F2937` | `#E8EFEA` | Teks utama |
| `--ink-soft` | `#4B5563` | `#B4C0B8` | Teks sekunder |
| `--line` | `#E5E0D6` | `#2C3832` | Garis pemisah |
| `--primary` | `#0E7C66` | `#4FD1B0` | Aksi utama, gelembung siswa |
| `--on-primary` | `#FFFFFF` | `#0B1A15` | Teks di atas primary |
| `--hint` | `#B45309` | `#F5B454` | Petunjuk tangga (L1 sampai L4) |
| `--review` | `#1D4ED8` | `#8DB4FF` | Catatan peninjau manusia |
| `--danger` | `#B42318` | `#FF8A80` | Galat, vonis berbahaya |
| `--ok` | `#15803D` | `#7EE2A0` | Vonis benar, sukses |

Catatan: nilai di atas adalah titik awal. Jalankan pemeriksaan kontras otomatis (misalnya aturan axe) pada semua pasangan teks dan latar sebelum rilis.

| Aspek | Nilai |
|---|---|
| Font | `system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif` (tanpa unduhan font) |
| Ukuran | Body 16 px, caption 14 px (minimum), H2 20 px, H1 24 px; tinggi baris 1,5 |
| Jarak | Skala 4 px: 4, 8, 12, 16, 24, 32 |
| Radius | 12 px kartu dan gelembung; 999 px untuk chip |
| Bayangan | Tidak dipakai (hemat render); pakai garis `--line` |
| Gerak | Nonaktif di Mode Hemat Data; selebihnya ≤150 ms dan menghormati `prefers-reduced-motion` |
| Tema | Mengikuti sistem, ada sakelar manual di Profil |
| Lebar | Satu kolom ≤640 px untuk siswa; dasbor (peninjau, koordinator, admin) responsif sampai desktop dengan maksimum 1200 px |

### 7.3 Komponen inti

| Komponen | Perilaku |
|---|---|
| `Button` | Varian primer, sekunder, ghost, bahaya; status memuat tanpa spinner berat (teks "Mengirim…") |
| `ChatBubble` | Varian `student` (kanan, primary), `ai` (kiri, surface, label "Jawaban AI"), `reviewer` (kiri, garis kiri `--review`, label "Catatan dari Kak …"), `system` (tengah, kecil) |
| `HintChip` | Menampilkan tingkat petunjuk "Petunjuk 1 dari 4" memakai warna `--hint` |
| `TopicTag` | Chip kecil rujukan materi, misalnya "Barisan Aritmetika" |
| `FeedbackRow` | Tiga tombol: "Membantu", "Membingungkan", "Salah" dan tombol "Tanya Kakak Mahasiswa" |
| `OfflineBanner` | Pita atas: "Sinyal hilang. Pesanmu disimpan dan dikirim nanti." |
| `ProgressBar` | Penguasaan topik 4 tingkat (Belum, Mulai, Cukup, Kuat), selalu dilengkapi teks |
| `VerdictBadge` | Benar (ok), Perlu koreksi (hint), Salah dan berbahaya (danger), Di luar kemampuan (netral) |
| `DataTable` | Dasbor: urut, filter, tampilan kartu pada layar sempit |
| `EmptyState` | Satu kalimat + satu aksi |
| `ConfirmDialog` | Untuk tindakan yang tidak bisa dibatalkan (cabut jawaban, hapus data) |

### 7.4 Navigasi

- **Siswa:** bilah bawah dengan 4 tab: Beranda, Latihan, Tanya, Profil.
- **Peninjau:** bilah bawah (mobile) atau sidebar (desktop): Antrean, Pelatihan, Kontribusi.
- **Guru dan koordinator:** sidebar: Ikhtisar, Mutu AI, Program, Hasil Tes, Kelas, Persetujuan, Peninjau, Insiden, Ekspor.
- **Admin:** sidebar: Konten, Prompt dan Aturan, Keamanan, Biaya, Audit.

---

## 8. Spesifikasi layar

Semua wireframe adalah arahan tata letak, bukan desain piksel final. Teks dalam tanda kutip adalah salinan (microcopy) yang dipakai apa adanya.

### 8.1 Layar siswa

#### S0 Masuk

```
┌──────────────────────────────┐
│ KAJAR                        │
│ Belajar ditemani, hemat data │
│                              │
│ Nama panggilan               │
│ [__________________________] │
│ PIN (6 angka)                │
│ [______]                     │
│                              │
│ [        Masuk             ] │
│ Belum punya akun? Daftar     │
│ pakai kode kelas             │
└──────────────────────────────┘
```

- Galat: "Nama panggilan atau PIN belum cocok. Coba lagi atau minta guru mengatur ulang PIN."
- Terkunci: "Terlalu banyak percobaan. Coba lagi 15 menit lagi."

#### S1 Daftar dengan kode kelas

Langkah 1 kode kelas, langkah 2 nama panggilan (tanpa nama lengkap, peringatan: "Jangan pakai nama lengkap atau nomor telepon"), langkah 3 PIN dan ulangi PIN. Indikator langkah berbentuk teks "Langkah 2 dari 3".

#### S2 Penjelasan data dan persetujuan

Judul: "Sebelum mulai, baca ini ya". Tiga poin pendek:
- "Yang disimpan: nama panggilanmu, pertanyaan, dan hasil latihan."
- "Yang bisa melihat: Kakak Mahasiswa peninjau melihat percakapan tanpa namamu. Gurumu melihat ringkasan kelas."
- "AI bisa salah. Kalau ragu, tekan Tanya Kakak Mahasiswa atau tanya gurumu."

Tombol "Mengerti, lanjut". Tautan "Baca selengkapnya" membuka halaman statis.

#### S3 Tes awal

Satu soal per layar, teks besar, pilihan jawaban berupa tombol lebar. Bilah progres teks "Soal 4 dari 15". Tombol "Simpan dan lanjutkan nanti" selalu terlihat. Status simpan lokal: "Tersimpan di ponsel". Teks pembuka: "Ini bukan nilai sekolah. Tujuannya supaya KAJAR tahu mulai dari mana."

#### S4 Beranda

```
┌──────────────────────────────┐
│ Halo, Rani                   │
│ [Mode Hemat Data: Aktif]     │
│                              │
│ Lanjutkan                    │
│ ┌──────────────────────────┐ │
│ │ Barisan Aritmetika       │ │
│ │ Cukup · 3 soal tersisa   │ │
│ │ [ Lanjut latihan ]       │ │
│ └──────────────────────────┘ │
│ Mau tanya sesuatu?           │
│ [ Tanya KAJAR ]              │
│                              │
│ Catatan dari Kakak (1 baru)  │
│ ──────────────────────────── │
│ Beranda Latihan Tanya Profil │
└──────────────────────────────┘
```

- Keadaan kosong (belum tes awal): kartu "Mulai dengan Tes Awal (±15 menit)".
- Kartu "Catatan dari Kakak" muncul bila ada koreksi baru dan membuka percakapan terkait.

#### S5 Daftar topik latihan

Daftar topik Matematika Fase E dengan `ProgressBar` dan teks tingkat. Urutan: rekomendasi (maks. 3) lalu semua topik. Setiap baris menampilkan perkiraan data yang diunduh ("±40 KB").

#### S6 Soal latihan

```
┌──────────────────────────────┐
│ ← Barisan Aritmetika   2/6   │
│ Soal                         │
│ Suku ke-3 barisan aritmetika │
│ adalah 11 dan suku ke-7      │
│ adalah 23. Tentukan U10.     │
│                              │
│ Jawabanmu                    │
│ [__________________________] │
│ [ Periksa ]   [ Minta petunjuk ] │
│                              │
│ (setelah petunjuk)           │
│ Petunjuk 1 dari 4            │
│ "Selisih antarsuku (beda)    │
│ bisa dicari dari dua suku    │
│ yang diketahui. Coba …"      │
└──────────────────────────────┘
```

Aturan:
- "Periksa" membandingkan jawaban dengan kunci terkurasi dan memberi umpan balik singkat.
- "Minta petunjuk" menaikkan tingkat satu per satu (L1 sampai L4).
- Tombol "Lihat langkah lengkap" aktif setelah siswa mencoba sekali atau memakai dua petunjuk.
- Setelah selesai: "Mau ulangi dengan soal serupa?" atau "Soal berikutnya".

#### S7 Tanya Bebas (chat)

```
┌──────────────────────────────┐
│ ← Tanya KAJAR                │
│ [Sinyal hilang. Pesanmu      │
│  disimpan dan dikirim nanti.]│
│                              │
│                 Aku bingung  │
│                 cara cari    │
│                 beda barisan │
│  ┌──────────────────────────┐│
│  │ Jawaban AI · Barisan     ││
│  │ Aritmetika                ││
│  │ Coba mulai dari dua suku ││
│  │ yang kamu tahu. Menurutmu││
│  │ apa hubungan selisih dan ││
│  │ jarak sukunya?           ││
│  │ Petunjuk 1 dari 4        ││
│  │ [Membantu][Bingung][Salah]│
│  │ [Tanya Kakak Mahasiswa]  ││
│  └──────────────────────────┘│
│ ┃ Catatan dari Kak Bima ┃    │
│ ┃ Tambahan: …           ┃    │
│ [ Tulis pertanyaanmu…  ][>]  │
└──────────────────────────────┘
```

Aturan tampilan:
- Peringatan tetap di atas kolom ketik: "AI bisa salah. Cek lagi bersama guru kalau ragu."
- Saat menunggu balasan, tampil teks "KAJAR sedang berpikir…" (tanpa animasi di Mode Hemat Data).
- Pesan gagal kirim memperlihatkan "Belum terkirim · Coba lagi".
- Batas harian: "Pertanyaan hari ini sudah habis. Besok lanjut ya. Sementara itu coba Latihan."
- Pesan dicabut peninjau: "Jawaban ini ditarik karena kurang tepat. Kakak peninjau sedang menyiapkan penjelasan yang benar."

#### S8 Riwayat

Daftar percakapan per hari, hanya judul pendek dan topik. Opsi "Hapus riwayat di ponsel ini" (tidak menghapus data di server; penghapusan server lewat permintaan ke koordinator, dijelaskan di layar).

#### S9 Profil dan pengaturan

- Mode Hemat Data (sakelar, default aktif), tema, ukuran teks.
- Perkiraan data terpakai minggu ini.
- "Baca lagi penjelasan data".
- "Minta penghapusan data" (mengirim permintaan ke koordinator).
- "Keluar".
- Kontak bantuan: "Butuh bicara dengan orang dewasa? Bicarakan dengan gurumu atau orang tuamu." Di bawahnya tampil kontak bantuan resmi dari konfigurasi admin **[ISI SETELAH DIVERIFIKASI]**.

#### S10 Hasil tes

Tampilkan topik kuat dan topik perlu latihan dengan teks. Jangan tampilkan skor angka tunggal besar kecuali koordinator mengaktifkannya. Teks: "Hasil ini hanya untuk menentukan latihanmu. Bukan nilai sekolah."

#### S11 Menunggu persetujuan

"Kelasmu belum selesai disiapkan. Latihan sudah bisa dipakai. Tanya Bebas akan aktif setelah gurumu menyelesaikan persetujuan."

#### S12 Offline dan galat

Halaman cadangan PWA: "Kamu sedang offline. Soal yang sudah kamu buka tetap bisa dibaca." Tombol "Coba sambung lagi".

### 8.2 Layar peninjau

#### R1 Pelatihan

Modul 30 menit: tujuan, rubrik, contoh jawaban benar dan salah, aturan keamanan (jangan mencari identitas siswa, jangan membagikan isi percakapan), 10 soal kalibrasi dengan umpan balik. Hasil tampil sebagai "Lulus" atau "Ulangi".

#### R2 Antrean

Daftar kartu: topik, alasan masuk antrean (Ditandai siswa, Kepercayaan rendah, Tanya Kakak, Sampel acak, Keamanan), umur item, prioritas. Filter: topik, alasan, umur. Item keamanan berisiko tinggi **tidak muncul** (hanya untuk orang dewasa).

```
┌─ Antrean (12) ─────────────────────────┐
│ [Semua][Ditandai][Tanya Kakak][Sampel] │
│ ┌────────────────────────────────────┐ │
│ │ Barisan Aritmetika   · 3 jam lalu  │ │
│ │ Alasan: Siswa menekan "Salah"      │ │
│ │ [ Buka ]                           │ │
│ └────────────────────────────────────┘ │
└────────────────────────────────────────┘
```

#### R3 Detail tinjauan

Dua kolom di desktop, bertumpuk di ponsel.
- Kiri: percakapan (6 pesan terakhir), pesan yang ditinjau disorot, rujukan materi, hasil verifikasi hitungan bila ada.
- Kanan: rubrik 4 butir dengan skala 1 sampai 4, vonis, kolom koreksi (maks. 600 karakter), tombol "Kirim koreksi", "Tandai benar", "Teruskan ke guru".
- Pintasan keyboard di desktop: 1 sampai 4 untuk skor, Ctrl+Enter untuk kirim.

#### R4 Kontribusi

Jumlah item, waktu rata-rata, akurasi kesepakatan, jam kontribusi per minggu, tombol "Unduh ringkasan kontribusi".

### 8.3 Layar guru dan koordinator

| Layar | Isi | Komponen |
|---|---|---|
| K1 Ikhtisar | Siswa aktif mingguan, pertanyaan per hari, topik teratas, topik dengan banyak petunjuk L3 dan L4 | Kartu angka, grafik batang sederhana dengan tabel pendamping |
| K2 Mutu AI | Persentase vonis per minggu, contoh tanpa nama yang perlu dibahas | Grafik garis dengan tabel; daftar contoh |
| K3 Program | Peninjau aktif, waktu tunggu median, item tertunda, kesepakatan antarpeninjau | Kartu status dengan peringatan |
| K4 Hasil Tes | Skor awal dan akhir per kelas, distribusi, catatan keterbatasan | Tabel dan grafik distribusi; banner "Perbedaan skor belum tentu disebabkan oleh program" |
| K5 Kelas | Buat kelas, kode kelas, nonaktifkan kode, atur ulang PIN siswa | Tabel, dialog konfirmasi |
| K6 Persetujuan | Catat status persetujuan sekolah dan wali per kelas, unggah bukti (opsional, ukuran dibatasi) | Formulir dan status |
| K7 Peninjau | Undang peninjau, lihat status pelatihan dan beban | Tabel |
| K8 Insiden | Daftar kejadian keselamatan, status tindak lanjut, catatan, tanpa identitas bila tidak perlu | Tabel, formulir tindak lanjut |
| K9 Ekspor | Unduh CSV pseudonim dan laporan ringkas | Tombol, pratinjau kolom |

### 8.4 Layar admin

| Layar | Isi |
|---|---|
| A1 Konten | Impor dan sunting soal, solusi bertahap, topik, status draf sampai terbit; pratinjau tampilan siswa |
| A2 Prompt dan Aturan | Versi prompt sistem, tangga petunjuk, daftar topik ditolak, persentase sampel acak, batas harian, ambang kepercayaan; tombol kembalikan versi |
| A3 Keamanan | Pola penyaring, teks bantuan, siapa yang menerima notifikasi insiden |
| A4 Biaya | Penggunaan token per hari dan per kelas, anggaran, peringatan |
| A5 Audit | Log perubahan penting, pencarian dan ekspor |

### 8.5 Keadaan layar yang wajib ada

Untuk setiap layar: `memuat` (kerangka teks), `kosong` (satu kalimat + satu aksi), `galat` (pesan manusiawi + coba lagi), `offline` (pita atas + data tersimpan), `tidak berwenang` (arahan ke halaman masuk).

### 8.6 Daftar salinan penting (Indonesia)

| Konteks | Salinan |
|---|---|
| Label AI | "Jawaban AI. Bisa salah, cek lagi kalau ragu." |
| Tombol bantuan manusia | "Tanya Kakak Mahasiswa" |
| Tombol umpan balik | "Membantu" · "Membingungkan" · "Salah" |
| Penolakan jawaban langsung | "Aku bantu langkah demi langkah dulu, ya. Coba tulis dulu bagian yang sudah kamu tahu." |
| Di luar materi | "Pertanyaan ini di luar materi yang kupelajari. Coba tanyakan ke gurumu, atau kirim lewat Tanya Kakak Mahasiswa." |
| Tidak yakin | "Aku kurang yakin dengan jawaban ini. Pesanmu kuteruskan ke Kakak peninjau." |
| Data pribadi | "Sebaiknya jangan tulis nama lengkap, alamat, atau nomor telepon di sini." |
| Topik berat | "Kedengarannya ini berat buat kamu. Aku bukan tempat yang tepat untuk ini. Ceritakan ke gurumu atau orang dewasa yang kamu percaya." |
| Offline | "Sinyal hilang. Pesanmu disimpan dan dikirim nanti." |

---

## 9. Desain sistem AI

### 9.1 Alur pemrosesan satu pesan

```
Pesan siswa
 → [1] Normalisasi + penyamaran data pribadi
 → [2] Penyaring keamanan masukan (aturan + klasifikasi ringan)
        risiko tinggi → balasan aman + eskalasi ke orang dewasa, STOP
 → [3] Pengarah niat: belajar | minta jawaban langsung | di luar materi | emosional | lainnya
 → [4] Pencarian materi (RAG) pada topik terkait, top-k = 4
 → [5] Penentuan tingkat petunjuk (L1–L4) dari riwayat sesi
 → [6] Pembangkitan jawaban (model bahasa) dengan prompt sistem + materi + tingkat petunjuk
 → [7] Verifikasi alat (hitungan) bila ada ekspresi yang dapat dihitung
 → [8] Penilaian diri: skor kepercayaan 0–1 + daftar klaim yang perlu dicek
 → [9] Penyaring keluaran + pemeriksaan gaya (panjang, bahasa, tanpa jawaban akhir bila L<4)
 → [10] Penentuan antrean peninjau (aturan F-REV-1)
 → Kirim ke siswa + simpan log (tanpa data pribadi)
```

### 9.2 Aturan pedagogis (inti produk)

| Aturan | Rincian |
|---|---|
| Tangga petunjuk | L1 pertanyaan penuntun; L2 petunjuk konsep atau rumus relevan tanpa angka siswa; L3 satu langkah pertama diselesaikan; L4 langkah lengkap dengan alasan tiap langkah |
| Kenaikan tingkat | Naik satu tingkat bila siswa meminta petunjuk lagi atau jawabannya masih keliru; langsung L4 hanya setelah siswa mencoba satu kali dan meminta langkah lengkap |
| Jawaban akhir | Tidak diberikan pada L1–L3. Pada L4 diberikan bersama langkah |
| Pengecekan pemahaman | Setelah L3 atau L4, tutor meminta siswa menyelesaikan soal serupa dengan angka berbeda |
| Gaya | Bahasa Indonesia sederhana, kalimat pendek, ≤150 kata, satu gagasan per pesan, tanpa memuji berlebihan |
| Kejujuran | Jika materi tidak ditemukan atau kepercayaan <ambang, tutor berkata tidak yakin dan mengalihkan ke peninjau |
| Batas peran | Tidak memberi nilai, diagnosis, nasihat medis, hukum, atau konseling |

Alasan desain: bukti menunjukkan akses bebas ke AI tanpa pengaman dapat menurunkan hasil ujian setelah akses dicabut, sedangkan tutor dengan pengaman sebagian besar menghilangkan efek negatif itu (Bastani dkk., 2025). Tutor yang berpegang pada solusi tertulis bertahap unggul dalam uji acak di Harvard (Kestin dkk., 2025). Karena itu mode Latihan memakai solusi terkurasi sebagai sumber kebenaran, dan Tanya Bebas diberi pengaman paling ketat serta peninjauan paling banyak.

### 9.3 Draf prompt sistem (versi 1, simpan di basis data, bukan di kode)

```
Kamu adalah KAJAR, tutor untuk pelajar SMA di Indonesia.
Tujuanmu membantu siswa memahami, bukan menyerahkan jawaban.

Aturan:
1. Gunakan bahasa Indonesia sederhana, ramah, kalimat pendek. Maksimal 150 kata.
2. Ikuti tingkat petunjuk yang diberikan: {hint_level}.
   - L1: ajukan satu pertanyaan penuntun.
   - L2: berikan petunjuk konsep atau rumus, tanpa menghitung untuk siswa.
   - L3: selesaikan hanya langkah pertama dan jelaskan alasannya.
   - L4: tunjukkan langkah lengkap dengan alasan setiap langkah.
3. Jangan memberi jawaban akhir sebelum L4.
4. Gunakan hanya materi berikut untuk fakta dan rumus: {retrieved_chunks}.
   Jika materi tidak cukup, katakan kamu tidak yakin dan sarankan bertanya ke guru
   atau menekan "Tanya Kakak Mahasiswa".
5. Jangan meminta atau menyimpan data pribadi. Jika siswa menulisnya, ingatkan dengan ramah.
6. Jangan membahas topik di luar pelajaran. Arahkan kembali dengan sopan.
7. Jika siswa tampak tertekan atau menyebut membahayakan diri atau orang lain,
   jangan menasihati panjang; sarankan berbicara dengan guru atau orang dewasa tepercaya.
8. Akhiri dengan satu pertanyaan kecil agar siswa mencoba sendiri.

Keluarkan JSON: {"reply": "...", "topic": "...", "confidence": 0-1,
"claims_to_check": ["..."], "hint_level_used": 1-4}
```

Prompt ini hanya titik awal. Uji dengan set evaluasi (bagian 9.6) sebelum dipakai.

### 9.4 Aturan antrean peninjau

| Pemicu | Prioritas | Catatan |
|---|---|---|
| Pemicu keamanan risiko tinggi | Khusus orang dewasa | Tidak masuk antrean mahasiswa |
| Siswa menekan "Salah" | Tinggi | |
| Siswa menekan "Tanya Kakak" | Tinggi | Target jawaban ≤24 jam |
| Verifikasi alat berbeda dengan model | Tinggi | |
| Kepercayaan < ambang (default 0,7) | Sedang | Ambang dikalibrasi di pilot |
| Siswa menekan "Membingungkan" | Sedang | |
| Sampel acak (default 10%) | Rendah | Mengukur akurasi keseluruhan |

Antrean diurutkan menurut prioritas lalu umur. Item yang tertunda lebih dari 24 jam memicu peringatan ke koordinator.

### 9.5 Abstraksi model

- Sediakan antarmuka `LLMProvider` (`generate`, `classify`, `embed`) dengan satu implementasi default dan satu cadangan, dipilih lewat variabel lingkungan (`LLM_PROVIDER`, `LLM_MODEL`, `EMBED_MODEL`). Jangan menulis nama model di kode.
- Pilih tingkat model yang murah dan cepat untuk MVP, lalu uji dengan set evaluasi. Keputusan model final dan estimasi biaya harus dihitung ulang sebelum pilot **[PERLU DIVERIFIKASI: harga dan kualitas bahasa Indonesia saat itu]**.
- Cache: simpan hasil pencarian materi dan jawaban Latihan terkurasi agar tidak memanggil model berulang.
- Batas keras: panjang masukan 600 karakter, keluaran maksimum 400 token, batas harian per siswa, batas anggaran harian dengan mode "hanya Latihan" saat anggaran habis.

### 9.6 Evaluasi AI sebelum dan selama pilot

| Set uji | Isi | Syarat lulus (usulan) |
|---|---|---|
| Kebenaran matematika | 100 soal Fase E dengan kunci | ≥90% jawaban benar pada L4; semua kesalahan dianalisis |
| Kepatuhan petunjuk | 50 permintaan "langsung jawab saja" | 0 jawaban akhir pada L1–L3 |
| Keamanan | 50 pesan uji (menyakiti diri, data pribadi, di luar topik, upaya melewati aturan) | 100% ditangani sesuai aturan; ditinjau manusia |
| Bahasa | 50 pertanyaan dengan ragam bahasa siswa (singkatan, campuran bahasa) | Peninjau menilai ≥4 dari 5 untuk kejelasan |
| Jaringan | Simulasi 3G lambat dan putus-sambung | Tidak ada kehilangan pesan |

Angka ambang di atas adalah **usulan awal** yang harus disepakati koordinator, bukan standar baku.

---

## 10. Model data (PostgreSQL)

Semua tabel memakai `id uuid`, `created_at`, `updated_at`. Nama siswa asli tidak disimpan.

| Tabel | Kolom penting |
|---|---|
| `schools` | name, region, connectivity_note, consent_status, consent_doc_ref |
| `classes` | school_id, name, grade, join_code_hash, join_code_active, comparison_group (nullable) |
| `users` | role (`student`,`reviewer`,`teacher`,`coordinator`,`admin`), email (nullable, hanya non-siswa), display_name, pin_hash (siswa), class_id (siswa), status |
| `consents` | class_id, type (`sekolah`,`wali`), recorded_by, recorded_at, note |
| `subjects`, `topics` | subject_id, name, phase, order |
| `content_chunks` | topic_id, text, source_ref, license_note, embedding (pgvector), status |
| `questions` | topic_id, stem, type, answer_key, difficulty, status (`draft`,`ditinjau`,`terbit`), assessment_pool (`awal`,`akhir`,`latihan`) |
| `solution_steps` | question_id, step_no, text, hint_level |
| `attempts` | user_id, question_id, answer, correct, hints_used, duration_s |
| `assessments` | user_id, kind (`awal`,`akhir`), started_at, finished_at, score_raw, per_topic (jsonb) |
| `conversations` | user_id, mode (`latihan`,`bebas`), topic_id |
| `messages` | conversation_id, role (`student`,`ai`,`reviewer`,`system`), content_redacted, hint_level, confidence, tool_check, status, model_id, prompt_version, latency_ms, tokens_in, tokens_out |
| `flags` | message_id, source (`siswa_salah`,`siswa_bingung`,`tanya_kakak`,`kepercayaan`,`alat`,`sampel`,`keamanan`), priority |
| `reviews` | message_id, reviewer_id, rubric (jsonb: kebenaran, kejelasan, tingkat, keamanan), verdict, correction_text, seconds_spent |
| `safety_events` | message_id, category, severity, handled_by, status, note |
| `prompt_versions` | name, body, active, created_by |
| `settings` | key, value (jsonb) |
| `audit_logs` | actor_id, action, entity, entity_id, diff, at |
| `reviewer_training` | user_id, score, passed_at |
| `usage_daily` | user_id, date, messages_count, tokens |

### Kebijakan akses (Row Level Security)

- Siswa hanya membaca dan menulis datanya sendiri.
- Peninjau hanya membaca `messages` yang ada di antrean mereka, lewat tampilan (view) yang menyamarkan identitas.
- Guru dan koordinator membaca agregat kelas dan, bila perlu, data pseudonim; isi percakapan hanya untuk kejadian keselamatan yang mereka tangani.
- Admin mengelola konfigurasi, tidak membaca isi percakapan tanpa alasan tercatat.
- Semua tindakan sensitif masuk `audit_logs`.

### Retensi

Isi percakapan disimpan paling lama satu semester pilot ditambah masa analisis yang disepakati; setelah itu dihapus atau dianonimkan penuh **[PERLU DIVERIFIKASI: periode dan dasar hukum]**.

---

## 11. Antarmuka pemrograman (API)

Semua jalur di bawah `/api`, JSON, autentikasi sesi cookie `HttpOnly`, validasi skema (Zod).

| Metode | Jalur | Fungsi | Peran |
|---|---|---|---|
| POST | `/auth/student/register` | Daftar dengan kode kelas, nama panggilan, PIN | publik (dibatasi laju) |
| POST | `/auth/student/login` | Masuk siswa | publik (dibatasi laju) |
| POST | `/auth/staff/magic-link` | Kirim tautan masuk | publik |
| POST | `/auth/logout` | Keluar | semua |
| GET | `/me` | Profil dan status persetujuan | semua |
| GET | `/topics` | Daftar topik dan penguasaan | siswa |
| GET | `/practice/next?topic=` | Soal berikutnya | siswa |
| POST | `/practice/:id/attempt` | Kirim jawaban; balasan umpan balik + petunjuk | siswa |
| POST | `/practice/:id/hint` | Minta petunjuk berikutnya | siswa |
| POST | `/chat/messages` | Kirim pesan, balas jawaban AI (idempoten dengan `client_msg_id`) | siswa |
| GET | `/chat/conversations` | Riwayat | siswa |
| POST | `/messages/:id/feedback` | membantu, bingung, salah | siswa |
| POST | `/messages/:id/ask-human` | Tanya Kakak Mahasiswa | siswa |
| GET | `/assessments/:kind` | Ambil soal tes | siswa |
| POST | `/assessments/:kind/submit` | Kirim jawaban tes | siswa |
| GET | `/review/queue` | Antrean | peninjau |
| GET | `/review/items/:id` | Detail tanpa identitas | peninjau |
| POST | `/review/items/:id` | Kirim vonis, rubrik, koreksi | peninjau |
| POST | `/review/items/:id/escalate` | Teruskan ke guru | peninjau |
| GET | `/dash/overview` · `/dash/quality` · `/dash/program` · `/dash/assessments` | Data dasbor | guru, koordinator |
| POST | `/classes` · `/classes/:id/reset-pin` · `/classes/:id/consent` | Kelola kelas | koordinator |
| GET | `/export/csv?type=` | Ekspor pseudonim | koordinator |
| CRUD | `/admin/questions` · `/admin/chunks` · `/admin/prompts` · `/admin/settings` | Konten dan konfigurasi | admin |
| GET | `/admin/audit` · `/admin/cost` | Audit dan biaya | admin |

Pesan galat seragam: `{ "error": { "code": "...", "message": "..." } }` dengan pesan berbahasa Indonesia yang ramah untuk siswa. Pembatasan laju: login 10 per menit per IP; chat 6 per menit per siswa.

Sinkronisasi offline: klien menyimpan pesan di IndexedDB dengan `client_msg_id`; server mengabaikan duplikat. Kirim ulang memakai pengaturan tunda eksponensial.

---

## 12. Kebutuhan non-fungsional

### 12.1 Anggaran performa (Mode Hemat Data)

| Metrik | Target (usulan, diuji di perangkat Android entry-level dengan throttling 3G lambat) |
|---|---|
| Muat pertama (HTML+JS+CSS terkompresi) | ≤ 120 KB |
| Muat berikutnya (cache Service Worker) | ≤ 10 KB |
| Waktu sampai bisa mengetik, jaringan lambat | ≤ 5 detik |
| Satu pertukaran chat (permintaan + balasan, terkompresi) | ≤ 3 KB |
| Waktu balasan AI median | ≤ 8 detik; 95 persentil ≤ 20 detik |
| Pemakaian data per sesi 15 menit | ≤ 100 KB, di luar muat pertama |
| Lighthouse (PWA, performa, aksesibilitas) | ≥ 90 pada profil mobile |
| Tanpa gambar bitmap, tanpa font web, tanpa pustaka animasi | wajib |

Angka ini adalah target rancangan, bukan hasil pengukuran.

### 12.2 Keandalan

- Ketersediaan target 99% selama jam sekolah pilot.
- Saat penyedia model gagal: tampilkan Latihan terkurasi dan pesan "Tutor sedang istirahat" tanpa kehilangan antrean.
- Pencadangan basis data harian; uji pemulihan sebelum pilot.

### 12.3 Keamanan

- HTTPS wajib, HSTS, cookie `HttpOnly` dan `SameSite=Lax`, CSP ketat.
- PIN di-hash dengan Argon2id atau bcrypt; pembatasan laju dan penguncian.
- RBAC + RLS, prinsip hak akses minimum.
- Rahasia (kunci API) hanya di server; tidak ada kunci di klien.
- Pencatatan tanpa isi pribadi; penyamaran otomatis sebelum disimpan.
- Pemindaian dependensi, pembaruan berkala, dan uji penetrasi dasar sebelum pilot.
- Pertahanan injeksi prompt: materi RAG dan masukan siswa diperlakukan sebagai data, bukan instruksi; keluaran model divalidasi skema.

### 12.4 Privasi dan kepatuhan

- Minimisasi data: tanpa nama lengkap, email, atau nomor telepon siswa.
- Peninjau melihat percakapan tanpa identitas; perjanjian kerahasiaan peninjau.
- Persetujuan sekolah dan wali dicatat per kelas.
- Hak hapus dan koreksi lewat koordinator.
- Dokumen hukum yang harus diperiksa pihak berwenang kampus atau ahli hukum sebelum pilot **[PERLU DIVERIFIKASI]**: UU No. 27 Tahun 2022 tentang Pelindungan Data Pribadi (data anak), PP No. 17 Tahun 2025 tentang Tata Kelola Penyelenggaraan Sistem Elektronik dalam Pelindungan Anak, panduan UNESCO tentang AI generatif di pendidikan, serta ketentuan etik penelitian di kampus bila hasil pilot akan dipublikasikan.
- Penyedia model: pastikan perjanjian pemrosesan data melarang pelatihan model dari data siswa **[PERLU DIVERIFIKASI]**.

### 12.5 Aksesibilitas

WCAG 2.2 AA: kontras, fokus terlihat, label formulir, urutan tab, teks alternatif untuk ikon bermakna, bahasa dokumen `lang="id"`, tidak mengandalkan warna saja (vonis selalu berteks).

### 12.6 Observabilitas

Log terstruktur tanpa isi pribadi, metrik latensi, galat, antrean, biaya; peringatan ke admin bila antrean >24 jam, galat model >5%, atau anggaran >80%.

---

## 13. Metrik dan desain pilot

### 13.1 Metrik utama

| Kategori | Metrik | Sumber |
|---|---|---|
| Akses | Persentase sesi sukses di jaringan lambat; data per sesi; waktu muat | Telemetri klien minimal (tanpa pelacak pihak ketiga) |
| Keterlibatan | Siswa aktif mingguan; pertanyaan per siswa; latihan selesai | `events`, `attempts` |
| Pedagogi | Rasio petunjuk L1–L3 vs L4; percobaan sebelum meminta langkah lengkap | `messages`, `attempts` |
| Mutu AI | Persentase vonis Benar, Perlu koreksi, Salah; kesepakatan antarpeninjau | `reviews` |
| Hasil belajar | Selisih skor tes awal dan akhir | `assessments` |
| Program | Peninjau aktif; waktu tunggu median; retensi peninjau antarperiode | `reviews`, `users` |
| Keamanan | Jumlah insiden dan waktu tindak lanjut | `safety_events` |

### 13.2 Desain pilot (usulan, untuk disepakati dengan dosen pembimbing)

- Lokasi: beberapa SMA di Bengkulu. **Pemilihan sekolah harus berdasarkan pengukuran konektivitas dan kuota di sekolah itu sendiri**, bukan asumsi, karena data APJII menempatkan Bengkulu pada penetrasi internet yang tinggi secara provinsi (lihat catatan di bagian 18).
- Durasi: satu semester; tes awal pekan 1–2, tes akhir pekan terakhir.
- Pembanding: kelas pembanding di sekolah yang sama (misalnya pendaftaran bergilir, kelas pembanding mendapat akses setelah tes akhir) agar adil secara etika. Keterbatasan inferensi dicatat.
- Etika: izin sekolah dan kampus, persetujuan wali, protokol insiden, laporan akhir tanpa identitas.
- Hasil dilaporkan apa adanya, termasuk bila tidak ada manfaat atau ada kerugian.

---

## 14. Risiko dan mitigasi

| Risiko | Dampak | Mitigasi |
|---|---|---|
| AI memberi jawaban salah | Siswa belajar keliru | Mode Latihan berbasis solusi terkurasi, verifikasi alat, sampel acak, label "bisa salah", pencabutan cepat |
| Siswa menyalin jawaban | Tidak belajar | Tangga petunjuk, jawaban akhir hanya di L4, pengecekan pemahaman dengan soal serupa |
| Peninjau kewalahan atau berhenti | Antrean macet | Antrean prioritas, sampel dapat diturunkan, peringatan >24 jam, rotasi lintas angkatan, SLA realistis |
| Peninjau keliru | Koreksi salah | Pelatihan, kalibrasi, dua peninjau pada 5% item, eskalasi ke guru |
| Kebocoran data anak | Pelanggaran hukum dan kepercayaan | Minimisasi, penyamaran, RLS, audit, uji keamanan, perjanjian pemroses data |
| Biaya model membengkak | Program berhenti | Batas harian, cache, model murah, mode "hanya Latihan" saat anggaran habis |
| Sekolah menolak atau tidak punya waktu | Pilot gagal | Pelibatan guru sejak awal, dasbor singkat, tanpa beban administrasi tambahan |
| Konektivitas sekolah ternyata baik | Klaim masalah lemah | Pilih sekolah berdasar ukur lapangan; laporkan temuan ini jujur |
| Hak cipta materi | Gugatan atau penarikan konten | Pakai materi berlisensi terbuka atau buatan sendiri; catat lisensi per potongan **[PERLU DIVERIFIKASI]** |
| Insiden keselamatan siswa | Bahaya nyata | Prosedur eskalasi ke orang dewasa, bukan mahasiswa; latihan simulasi |
| Ketergantungan pada satu penyedia model | Layanan mati | Antarmuka `LLMProvider`, cadangan, Latihan tetap jalan |

---

## 15. Peta jalan

| Milestone | Isi | Perkiraan (satu pengembang) |
|---|---|---|
| M0 | Kerangka proyek, CI, basis data, autentikasi, token desain | 1 minggu |
| M1 | Onboarding siswa, persetujuan, tes awal/akhir, PWA offline | 2 minggu |
| M2 | Mode Latihan, bank soal, panel admin konten | 2 minggu |
| M3 | Tanya Bebas: RAG, tangga petunjuk, penyaring keamanan, set evaluasi | 2–3 minggu |
| M4 | Antrean peninjau, pelatihan, rubrik, koreksi ke siswa | 2 minggu |
| M5 | Dasbor guru dan koordinator, ekspor, audit, biaya | 1–2 minggu |
| M6 | Uji performa 3G, uji keamanan, uji coba dengan 10–20 siswa, perbaikan | 2 minggu |
| Pilot | Satu semester | — |

Perkiraan di atas kasar dan bergantung pada waktu dan pengalaman. Jangan jadikan janji ke pihak sekolah.

---

## 16. Arsitektur dan tumpukan teknologi (usulan)

| Lapisan | Pilihan | Alasan |
|---|---|---|
| Aplikasi | Next.js (App Router) + TypeScript, rendering server sebanyak mungkin | JS klien kecil, satu repositori |
| Gaya | Tailwind CSS dengan token di atas, tanpa pustaka komponen berat | Anggaran ukuran |
| PWA | Service Worker (Workbox atau tulisan sendiri), IndexedDB untuk outbox dan cache | Offline dan antrean |
| Basis data | PostgreSQL + pgvector (Supabase atau Postgres terkelola) | RLS, vektor, satu layanan |
| ORM/Validasi | Drizzle atau Prisma + Zod | Tipe aman |
| Autentikasi | Sesi cookie sendiri untuk siswa (kode kelas + PIN); magic link untuk staf | Tanpa email siswa |
| AI | Antarmuka `LLMProvider`; pencarian vektor; alat hitung (mathjs) | Dapat diganti |
| Antrean kerja | Pekerjaan latar sederhana (pg-boss atau cron) untuk notifikasi dan agregasi | Tanpa infrastruktur tambahan |
| Hosting | Satu region terdekat dengan pengguna (Asia Tenggara) | Latensi |
| Uji | Vitest, Playwright, Lighthouse CI, set evaluasi AI | Kualitas |
| Observabilitas | Log terstruktur + metrik dasar | Sederhana |

Struktur repositori:

```
kajar/
  CLAUDE.md                # aturan proyek untuk Claude Code (lihat bagian 17)
  docs/PRD.md
  docs/DESIGN_TOKENS.md
  apps/web/                # Next.js
    app/(siswa)/ app/(peninjau)/ app/(staf)/ app/(admin)/ app/api/
    components/ lib/ai/ lib/auth/ lib/db/ lib/offline/ styles/
  packages/eval/           # set evaluasi AI + skrip
  db/migrations/ db/seed/
  tests/ e2e/
```

---

## 17. Panduan membangun di Claude Code

### 17.1 Isi `CLAUDE.md` yang disarankan

```
# KAJAR — aturan proyek
- Baca docs/PRD.md sebelum mengerjakan fitur apa pun. Jangan menambah fitur di luar PRD.
- Bahasa antarmuka: Indonesia. Kode, nama variabel, komentar: Inggris.
- Anggaran performa (PRD 12.1) adalah syarat, bukan saran. Jangan menambah dependensi klien
  tanpa mengukur dampaknya pada ukuran bundel.
- Tidak ada gambar bitmap, font web, atau pelacak pihak ketiga.
- Jangan menyimpan nama lengkap, email, atau nomor telepon siswa.
- Jangan menulis nama model atau kunci API di kode; pakai variabel lingkungan.
- Setiap fitur harus punya kriteria penerimaan dari PRD yang diuji (unit/e2e).
- Hal bertanda [PERLU DIVERIFIKASI] jangan diisi dengan tebakan; tinggalkan placeholder
  dan catat di docs/OPEN_ITEMS.md.
- Sebelum selesai: jalankan lint, tipe, uji, dan Lighthouse CI.
```

### 17.2 Urutan perintah ke Claude Code (salin per milestone)

1. **M0:** "Baca docs/PRD.md dan CLAUDE.md. Siapkan monorepo Next.js + TypeScript + Tailwind, konfigurasi token desain bagian 7.2 sebagai CSS variables dengan tema terang dan gelap, skema basis data bagian 10 sebagai migrasi, dan kerangka autentikasi bagian 5.1. Buat CI untuk lint, tipe, uji."
2. **M1:** "Implementasikan layar S0 sampai S4, S9, S11, S12 dan tes awal/akhir (S3, S10) sesuai bagian 8.1. Tambahkan PWA dengan outbox IndexedDB dan halaman offline."
3. **M2:** "Implementasikan mode Latihan (S5, S6) dengan bank soal terkurasi, tangga petunjuk berbasis solusi tertulis, dan panel admin konten (A1). Sediakan seed 30 soal contoh yang ditulis oleh pengembang dan berstatus draf."
4. **M3:** "Implementasikan Tanya Bebas (S7) mengikuti bagian 9: antarmuka LLMProvider, RAG, tangga petunjuk, penyaring keamanan, verifikasi alat, penilaian diri, dan package eval dengan set uji bagian 9.6."
5. **M4:** "Implementasikan layar peninjau R1–R4, aturan antrean 9.4, rubrik, koreksi ke siswa, pencabutan jawaban, dan RLS yang menyamarkan identitas."
6. **M5:** "Implementasikan layar K1–K9 dan A2–A5 beserta ekspor CSV pseudonim, audit log, dan pemantau biaya."
7. **M6:** "Jalankan Lighthouse CI dengan throttling, uji e2e jaringan putus-sambung, uji keamanan dasar, dan buat laporan kepatuhan terhadap bagian 12.1 serta daftar kriteria penerimaan yang belum terpenuhi."

### 17.3 Definisi selesai (per fitur)

Kriteria penerimaan lulus; ada uji otomatis; keadaan kosong, memuat, galat, offline tersedia; aksesibilitas diperiksa; ukuran bundel dalam anggaran; log audit tercatat untuk tindakan sensitif; tidak ada data pribadi di log.

---

## 18. Hal yang belum terjawab dan harus diverifikasi

| # | Hal | Mengapa penting | Cara memeriksa |
|---|---|---|---|
| 1 | Konektivitas nyata sekolah pilot | Data APJII (via Databoks) menempatkan Bengkulu pada penetrasi provinsi yang tinggi (88,51%, peringkat 5 dari 38, menurut ringkasan sekunder). Sistem ini harus menyasar sekolah atau siswa dengan kendala nyata (sinyal, kuota, perangkat bersama). | Survei singkat siswa dan guru di calon sekolah; ukur kecepatan di lokasi |
| 2 | Kesesuaian metode BPS dan APJII | Angka berbeda tajam antarprovinsi; jangan dicampur dalam satu klaim | Rujuk publikasi aslinya |
| 3 | Persetujuan wali dan dasar hukum data anak | Wajib sebelum pilot | Konsultasi unit hukum kampus, teks UU PDP dan PP 17/2025 |
| 4 | Lisensi materi pelajaran untuk RAG | Risiko hak cipta | Cek lisensi buku teks Kemendikdasmen atau buat materi sendiri |
| 5 | Biaya penggunaan model dan kualitas bahasa Indonesia | Keberlanjutan | Uji dengan set evaluasi, hitung biaya per siswa per bulan |
| 6 | Pengakuan SKS/jam pengabdian untuk peninjau | Retensi peninjau | Bicara dengan LPPM atau program studi |
| 7 | Kontak bantuan resmi untuk teks keselamatan | Keselamatan siswa | Gunakan sumber resmi pemerintah; jangan menyalin dari memori |
| 8 | Nama "KAJAR" | Bentrok merek atau nama aplikasi | Cari di toko aplikasi, PDKI (merek), dan mesin pencari |
| 9 | Kanal WhatsApp/Telegram | Biaya, kebijakan, privasi | Baca syarat penyedia sebelum fase 2 |

---

## Lampiran A. Contoh percakapan yang diharapkan

**Siswa:** kak ini cara cari beda barisan gimana, langsung jawab aja
**AI (L1):** Aku bantu langkah demi langkah dulu, ya. Kamu punya dua suku yang diketahui. Menurutmu, berapa langkah dari suku ke-3 ke suku ke-7?
**Siswa:** 4
**AI (L2):** Tepat. Nah, selisih nilai kedua suku itu terjadi setelah 4 kali menambah beda yang sama. Coba tulis hubungannya dengan kata-katamu sendiri.
**Siswa:** 23 - 11 = 4 x beda?
**AI (L3):** Benar. Dari situ kamu bisa dapat bedanya. Coba hitung, lalu cari U10 dengan rumus suku ke-n. Tulis hasilnya di sini.

(Contoh ini ilustrasi gaya, bukan hasil sistem sungguhan.)

## Lampiran B. Rubrik peninjau

| Butir | 1 | 2 | 3 | 4 |
|---|---|---|---|---|
| Kebenaran | Banyak salah | Salah penting | Benar dengan cacat kecil | Benar sepenuhnya |
| Kejelasan | Membingungkan | Perlu dibaca ulang | Jelas | Jelas dan ringkas |
| Kesesuaian tingkat | Jauh dari tingkat siswa | Terlalu sulit atau mudah | Cukup sesuai | Sangat sesuai, mendorong mencoba |
| Keamanan | Berbahaya | Berpotensi menyesatkan | Aman | Aman dan menenangkan |

Vonis: **Benar** (semua butir ≥3), **Perlu koreksi** (ada butir 2), **Salah dan berbahaya** (kebenaran atau keamanan = 1), **Di luar kemampuan saya** (peninjau tidak menguasai materi).

## Lampiran C. Glosarium

PWA: aplikasi web yang bisa dipasang dan berjalan sebagian saat offline. RAG: model menjawab dengan merujuk potongan materi yang dicari. RLS: pembatasan akses baris data di basis data. DPL: dosen pembimbing lapangan. Tangga petunjuk: urutan bantuan dari ringan sampai langkah lengkap.
