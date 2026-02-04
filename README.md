🚀 GenZChat - Ultimate Edition (SQLite Version)
GenZChat adalah aplikasi real-time chat modern yang dibangun menggunakan Node.js, Express, dan Socket.io. Versi ini telah dimigrasikan sepenuhnya ke SQLite (menggunakan better-sqlite3) untuk performa yang lebih cepat, stabil, dan aman dibandingkan penyimpanan file JSON tradisional.
✨ Fitur Utama
Aplikasi ini mencakup fitur-fitur lengkap untuk komunitas sosial:
 * 🔐 Otentikasi Aman: Login, Register, dan Verifikasi OTP via Email.
 * 💬 Chat Canggih:
   * Private Chat & Group Chat.
   * Upload Media (Gambar, Video, Audio).
   * Reply, Edit, Delete, dan Pin Message.
   * Disappearing Messages (Pesan otomatis terhapus sesuai timer).
   * Security: Cek blokir dua arah (Two-way block check).
 * 🎵 Music Room (Vibe Session): Dengarkan lagu bareng teman secara realtime (Synchronized Playback).
 * 🎨 Live Doodles: Menggambar bersama di kanvas real-time dengan history penyimpanan.
 * 👥 Sistem Pertemanan: Add, Accept, Reject, dan Block User.
 * 🛠️ Admin Panel: Manajemen User (Ban, Kick), Role Management, dan System Settings.
 * 🔔 Push Notifications: Notifikasi browser saat ada chat masuk ketika offline.
 * 🌈 Profil Kustom: Ganti foto profil dan mode warna "Rainbow" untuk nama user.
🛠️ Tech Stack
 * Backend: Node.js, Express.js
 * Database: SQLite (via library better-sqlite3)
 * Realtime: Socket.io
 * Frontend: EJS (Templating), CSS, Vanilla JS
 * Security: BcryptJS (Password Hashing), Express-Session
 * Utilities: Nodemailer (Email), Web-Push, Multer (Uploads)
⚙️ Instalasi & Setup
Ikuti langkah ini untuk menjalankan server di komputer lokal atau VPS:
1. Persiapan
Pastikan kamu sudah menginstall Node.js (versi 14 atau lebih baru) di komputer.
2. Install Dependencies
Buka terminal di folder project dan jalankan perintah ini untuk menginstall semua library yang dibutuhkan:
npm install

Pastikan package.json kamu sudah menyertakan dependencies seperti better-sqlite3, socket.io, express, dll.
3. Konfigurasi Environment (.env)
Buat file bernama .env di root folder project dan isi konfigurasi berikut:
PORT=3000
SESSION_SECRET=ganti_string_ini_menjadi_sangat_rahasia
# Konfigurasi Email untuk OTP (Wajib pakai App Password jika Gmail)
EMAIL_USER=emailkamu@gmail.com
EMAIL_PASS=password_app_gmail_anda

4. Setup Database (Otomatis)
Kamu tidak perlu membuat file database secara manual.
Saat server pertama kali dijalankan:
 * Folder database/ akan dibuat otomatis.
 * File genzchat.db akan dibuat.
 * Tabel (users, rooms, music_sessions, doodles) akan di-generate otomatis oleh script database.js dan server.js.
🚀 Menjalankan Server
Jalankan perintah berikut di terminal:
node server.js

Atau jika menggunakan nodemon (untuk development):
npx nodemon server.js

Jika berhasil, terminal akan menampilkan:
> [DB] SQLite Database Connected & Ready
> [SQLITE] GenZChat Server running on port 3000
> 
Buka browser dan akses:
👉 http://localhost:3000
📂 Struktur Project
genzchat-sqlite/
├── database/            # Folder tempat file genzchat.db otomatis dibuat
├── public/              # File statis (CSS, JS Client, Uploads)
│   └── uploads/         # Folder penyimpanan gambar/lagu user
├── sessions/            # Penyimpanan session login (file-store)
├── views/               # Template HTML Frontend (EJS)
├── .env                 # Konfigurasi rahasia
├── database.js          # Koneksi & Inisialisasi Tabel SQLite
└── server.js            # Logic Utama Server (Backend)

👑 Cara Menjadi Admin (Penting!)
Karena database dimulai dari kosong (fresh install), user pertama yang mendaftar adalah User Biasa. Untuk mengubah user menjadi Admin:
 * Register akun baru di aplikasi (misal: username "AdminGanteng").
 * Gunakan aplikasi DB Browser for SQLite (Gratis, download di internet).
 * Buka file database/genzchat.db.
 * Buka tab Browse Data -> Pilih Tabel users.
 * Cari user kamu, ubah kolom role dari 'user' menjadi 'admin'.
 * Klik tombol Write Changes (Simpan).
 * Logout dan Login kembali di aplikasi.
 * Sekarang kamu bisa mengakses menu /admin.
📝 Catatan Migrasi (JSON ke SQLite)
Jika kamu berpindah dari versi lama yang menggunakan data.json:
 * Data Lama: Data dari data.json tidak otomatis dipindahkan ke SQLite. Server ini memulai database baru yang bersih.
 * Performa: SQLite jauh lebih cepat menangani ribuan pesan dibanding JSON.
 * JSON Field: Meskipun menggunakan SQL, kita menyimpan data kompleks (seperti list teman, isi chat) dalam kolom tipe JSON di SQLite agar struktur kode tidak berubah drastis dari versi sebelumnya.
🤝 Kontribusi
Silakan fork repository ini dan buat Pull Request jika ingin menambahkan fitur baru!
Created with ❤️ for arthur
