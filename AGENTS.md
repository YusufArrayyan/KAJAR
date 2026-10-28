# KAJAR — aturan proyek

- Baca docs/PRD.md sebelum mengerjakan fitur apa pun. Jangan menambah fitur di luar PRD.
- Bahasa antarmuka: Indonesia (sapaan "kamu" untuk siswa; layar staf memakai kalimat perintah tanpa sapaan). Kode, nama variabel, komentar: Inggris.
- Anggaran performa (PRD 12.1) adalah syarat, bukan saran. Klien tanpa dependensi dan tanpa bundler; cek dengan `npm run budget`.
- Tidak ada gambar bitmap di halaman, font web, atau pelacak pihak ketiga. Ikon PNG hanya untuk manifest PWA.
- Jangan menyimpan nama lengkap, email, atau nomor telepon siswa.
- Jangan menulis nama model atau kunci API di kode; pakai variabel lingkungan (`LLM_PROVIDER`, `LLM_MODEL`).
- Setiap fitur punya kriteria penerimaan dari PRD yang diuji (`npm test`).
- Hal bertanda [PERLU DIVERIFIKASI] jangan diisi tebakan; tinggalkan placeholder dan catat di docs/OPEN_ITEMS.md.
- Token desain ada di docs/DESIGN.md dan public/css/app.css. Jangan menulis warna mentah di luar token.
- Sebelum selesai: jalankan `npm test`, `npm run eval`, `npm run budget`.
