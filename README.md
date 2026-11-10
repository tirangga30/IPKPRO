# IPKPRO — Kalkulator IPK & Perencana Akademik (Laravel + Neon DB + Vercel)

Aplikasi web penghitung **IPK & IPS** kuliah modern berbasis **Laravel 12**, siap dihubungkan ke database **Neon PostgreSQL** dan dideploy ke **Vercel** (`vercel-php`).

## Fitur Utama

- **Manajemen Semester & Mata Kuliah**: Tambah semester baru, ubah nama/periode, urutkan naik/turun, duplikat, lipat/buka (*collapse*), serta hapus dengan fitur **Urungkan (Undo)**.
- **Input Nilai Fleksibel**: Masukkan **Nilai Angka (0–100)** untuk konversi otomatis ke huruf, atau pilih **Nilai Huruf** langsung. Tekan `Enter` di baris matkul untuk tambah baris berikutnya dengan cepat.
- **Kustomisasi Skala Nilai**: Tersedia 4 preset skala kampus Indonesia (*Standar Plus-Minus*, *Skala AB / BC*, *Skala Kelipatan 0.25*, *Skala Klasik 5 Huruf*) yang bobot & batas angkanya dapat diubah sesuai aturan kampus.
- **Aturan Matkul Mengulang**: Mendukung mode *Hitung Semua*, *Ambil Nilai Terbaik*, dan *Ambil Nilai Terbaru* (IPS semester lama tetap akurat sesuai KHS).
- **Dashboard Analitik & Target IPK**: Gauge IPK, predikat kelulusan, estimasi maksimal SKS semester depan, grafik SVG tren IPS vs IPK, distribusi nilai huruf, dan simulasi target IPK lulus.
- **Sinkronisasi Database & Akun**: Dapat langsung dipakai sebagai tamu (*guest workspace cookie*) maupun daftar/masuk akun agar data tersinkronisasi di database lintas perangkat.
- **Ekspor & Cetak Transkrip**: Backup & restore JSON, ekspor CSV (Excel), mode Gelap/Terang, dan tampilan cetak PDF **Transkrip Akademik Sementara**.

---

## Menjalankan Secara Lokal

1. Instal dependensi Composer dan siapkan `.env`:
   ```bash
   composer install
   cp .env.example .env
   php artisan key:generate
   ```
2. Jalankan migrasi (secara default lokal memakai SQLite):
   ```bash
   php artisan migrate
   ```
3. Jalankan server pengembangan:
   ```bash
   php artisan serve
   ```
4. Jalankan pengujian PHPUnit:
   ```bash
   php artisan test
   ```

---

## Konfigurasi Database Neon PostgreSQL

1. Buat project & database di [Neon Console](https://console.neon.tech/).
2. Salin connection string PostgreSQL dari Neon (gunakan *Direct Connection* saat menjalankan migrasi).
3. Pada `.env` lokal atau Environment Variables di Vercel, atur:
   ```env
   DB_CONNECTION=pgsql
   DATABASE_URL="postgresql://USER:PASSWORD@ep-xxxx.REGION.aws.neon.tech/neondb?sslmode=require"
   DB_SSLMODE=require
   ```
   > `config/database.php` sudah dikonfigurasi otomatis untuk mengekstrak `endpoint` SNI Neon jika host berakhiran `.neon.tech`.
4. Jalankan migrasi ke database Neon:
   ```bash
   php artisan migrate --force
   ```

---

## Deploy ke Vercel

Proyek ini sudah menyertakan `vercel.json`, `api/index.php`, `.vercelignore`, dan penyesuaian `bootstrap/app.php` untuk filesystem read-only Vercel (`/tmp/storage`).

1. Hubungkan repositori GitHub ini di dashboard **Vercel** (`Add New Project`).
2. Tambahkan **Environment Variables** berikut di pengaturan project Vercel:
   - `APP_KEY` — salin dari `.env` lokal (`base64:...`)
   - `APP_URL` — URL deployment Vercel kamu (mis. `https://ipkpro.vercel.app`)
   - `DB_CONNECTION` = `pgsql`
   - `DATABASE_URL` = *Connection string Neon PostgreSQL (Pooled atau Direct)*
   - `DB_SSLMODE` = `require`
3. Deploy! Cek koneksi database setelah deploy melalui endpoint `/api/health`.
