// S2 content shared by onboarding, Profil, and the public /privasi page.
import { html } from './app.js';

export const privacyPoints = html`<ul class="stack-sm prose">
  <li><strong>Yang disimpan:</strong> nama panggilanmu, pertanyaan, dan hasil latihan.</li>
  <li><strong>Yang bisa melihat:</strong> Kakak Mahasiswa peninjau melihat percakapan tanpa namamu. Gurumu melihat ringkasan kelas.</li>
  <li><strong>AI bisa salah.</strong> Kalau ragu, tekan Tanya Kakak Mahasiswa atau tanya gurumu.</li>
</ul>`;

export function privacyBody(withBack = true) {
  return html`<div class="topbar">${withBack ? html`<a class="back" href="/profil" aria-label="Kembali ke Profil"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></a>` : ''}<h1>Penjelasan data</h1></div>
  <div class="card prose">
    <h2>Ringkasnya</h2>
    ${privacyPoints}
  </div>
  <div class="card prose">
    <h2>Selengkapnya</h2>
    <p>KAJAR tidak meminta nama lengkap, email, atau nomor telepon siswa. Kalau kamu tidak sengaja menulis nomor telepon atau alamat, sistem menyamarkannya sebelum disimpan.</p>
    <p>Kakak Mahasiswa peninjau hanya melihat potongan percakapan tanpa nama, untuk memeriksa apakah jawaban AI benar. Mereka sudah berjanji menjaga kerahasiaan dan tidak membagikan isi percakapan.</p>
    <p>Gurumu dan koordinator program melihat ringkasan kelas, misalnya topik yang paling sering ditanyakan. Isi percakapan hanya dibuka orang dewasa kalau ada tanda kamu butuh bantuan untuk keselamatanmu.</p>
    <p>Hasil tes awal dan tes akhir bukan nilai sekolah. Hasilnya dipakai untuk memilih latihan dan untuk menilai apakah program ini membantu.</p>
    <p>Kamu atau walimu boleh meminta semua data dihapus lewat menu Profil. Permintaan diteruskan ke koordinator dan diproses paling lambat 7 hari kerja.</p>
    <p>Data tidak dijual dan tidak dipakai untuk iklan.</p>
  </div>`;
}
