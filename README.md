# 💬 GenZChat

> **Real-time chat application** berbasis Node.js + Socket.IO dengan fitur musik bersama, live doodling, sistem admin, notifikasi push, dan masih banyak lagi. Dibangun dengan SQLite sebagai database utama — ringan, cepat, tanpa konfigurasi server database eksternal.

---

## 📋 Daftar Isi

- [Fitur](#-fitur)
- [Tech Stack](#-tech-stack)
- [Struktur Folder](#-struktur-folder)
- [Persyaratan Sistem](#-persyaratan-sistem)
- [Instalasi](#-instalasi)
- [Konfigurasi Environment](#-konfigurasi-environment)
- [Setup Pertama Kali](#-setup-pertama-kali)
- [Menjalankan Aplikasi](#-menjalankan-aplikasi)
- [Dokumentasi Fitur](#-dokumentasi-fitur)
- [Route & Endpoint](#-route--endpoint)
- [Perintah Utilitas](#-perintah-utilitas)
- [Database Schema](#-database-schema)
- [Troubleshooting](#-troubleshooting)

---

## ✨ Fitur

| Fitur | Deskripsi |
|---|---|
| 💬 **Real-time Chat** | Chat pribadi & grup dengan Socket.IO |
| 🎵 **Ruang Musik** | Dengarkan musik bersama secara sinkron |
| 🎨 **Live Doodles** | Papan gambar kolaboratif secara real-time |
| 🔔 **Push Notification** | Notifikasi browser via Web Push (VAPID) |
| 👑 **Panel Admin** | Manajemen user, role, ban, & broadcast |
| 🔒 **OTP Verification** | Verifikasi email saat registrasi |
| 📁 **Upload File** | Upload gambar & file di dalam chat |
| 🛠️ **Maintenance Mode** | Tombol maintenance dari panel admin |
| 🎭 **Custom Role** | Buat role dengan warna & permission custom |
| 👤 **Profile Lengkap** | Foto profil, bio (moots), dan update username |
| 🔗 **Invite Group** | Bergabung ke grup via kode undangan |
| 📌 **Pin Pesan** | Pin pesan penting di dalam room |
| 🚫 **Blokir User** | Fitur blokir & unblokir pengguna lain |

---

## 🛠 Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js v5
- **Realtime**: Socket.IO v4
- **Database**: SQLite (better-sqlite3)
- **Template Engine**: EJS
- **Auth**: express-session + bcryptjs
- **Email**: Nodemailer
- **Push Notif**: web-push (VAPID)
- **Upload**: Multer
- **Session Store**: session-file-store

---

## 📁 Struktur Folder

```
genZChat/
├── server.js           # Entry point utama aplikasi
├── database.js         # Koneksi & inisialisasi SQLite
├── setup.js            # Script setup user pertama (admin)
├── reset.js            # Script reset database & uploads
├── package.json
├── .env                # Konfigurasi environment (buat manual)
│
├── database/
│   └── genzchat.db     # File database SQLite (auto-generated)
│
├── public/
│   ├── uploads/        # Folder file yang diupload user
│   ├── sw.js           # Service Worker (PWA)
│   └── manifest.json   # PWA Manifest
│
├── views/
│   ├── login.ejs
│   ├── register.ejs
│   ├── dashboard.ejs
│   ├── chat.ejs
│   ├── chat_list.ejs
│   ├── chat_room.ejs
│   ├── admin.ejs
│   ├── ruangmusik.ejs
│   ├── music_list.ejs
│   ├── livedoodles.ejs
│   ├── doodle_list.ejs
│   ├── maintenance.ejs
│   └── partials/
│       ├── header.ejs
│       ├── msg_item.ejs
│       ├── broadcast_modal.ejs
│       └── system_scripts.ejs
│
└── sessions/           # Folder session login (auto-generated)
```

---

## 💻 Persyaratan Sistem

- **Node.js** v18 atau lebih baru
- **npm** v9 atau lebih baru
- Sistem operasi: Windows, macOS, atau Linux

> ⚠️ `better-sqlite3` membutuhkan build tools. Di Windows, pastikan sudah install **Visual Studio Build Tools**. Di Linux/macOS pastikan `python3` dan `make` tersedia.

---

## 🚀 Instalasi

### 1. Clone atau Extract Project

```bash
# Jika dari zip, extract dulu
# Lalu masuk ke folder project
cd genZChat
```

### 2. Install Dependencies

```bash
npm install
```

> Proses ini mungkin memerlukan beberapa menit karena `better-sqlite3` perlu dikompilasi secara native.

### 3. Buat Folder yang Diperlukan

```bash
# Linux / macOS
mkdir -p database public/uploads sessions

# Windows (Command Prompt)
mkdir database
mkdir public\uploads
mkdir sessions
```

---

## ⚙️ Konfigurasi Environment

Buat file `.env` di root folder project:

```bash
# Linux / macOS
touch .env

# Windows
type nul > .env
```

Isi file `.env` dengan konfigurasi berikut:

```env
# ==========================================
# SERVER
# ==========================================
PORT=3000
SESSION_SECRET=ganti_dengan_string_rahasia_acak_panjang

# ==========================================
# EMAIL (untuk OTP registrasi)
# ==========================================
EMAIL_USER=emailkamu@gmail.com
EMAIL_PASS=app_password_gmail_kamu

# ==========================================
# VAPID KEYS (Push Notification)
# Generate dengan: npx web-push generate-vapid-keys
# ==========================================
VAPID_PUBLIC_KEY=isi_public_key_disini
VAPID_PRIVATE_KEY=isi_private_key_disini
VAPID_EMAIL=mailto:emailkamu@gmail.com
```

### Generate VAPID Keys

Jalankan perintah berikut untuk mendapatkan VAPID keys:

```bash
npx web-push generate-vapid-keys
```

Copy hasilnya ke `.env`.

### Setup Gmail App Password

Jika menggunakan Gmail untuk pengiriman OTP:

1. Aktifkan **2-Factor Authentication** di akun Google kamu
2. Buka [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
3. Buat App Password untuk "Mail"
4. Gunakan password yang dihasilkan sebagai `EMAIL_PASS`

> 💡 **Catatan**: Jika tidak ingin menggunakan email, fitur OTP masih bisa dibiarkan (registrasi akan tetap berjalan tapi OTP tidak terkirim).

---

## 🔧 Setup Pertama Kali

Setelah instalasi dan konfigurasi `.env`, jalankan setup untuk membuat **user admin pertama**:

```bash
node setup.js --build
```

Ikuti promptnya:

```
=== GENZCHAT SETUP BUILD (SQLITE) ===
Membuat User Pertama...

-> username: admin
-> email: admin@example.com
-> password: ********
-> admin y/n? [y/n]: y

[SUCCESS] User created in SQLite database!
Jalankan aplikasi dengan: node server.js
```

> ⚠️ Langkah ini hanya perlu dilakukan **sekali** saat pertama kali setup. Setelah itu, tambah user bisa melalui halaman registrasi atau panel admin.

---

## ▶️ Menjalankan Aplikasi

```bash
node server.js
```

atau menggunakan npm script:

```bash
npm start
```

Buka browser dan akses:

```
http://localhost:3000
```

### Menjalankan di Background (Production)

Disarankan menggunakan **PM2** untuk production:

```bash
# Install PM2 secara global
npm install -g pm2

# Jalankan aplikasi
pm2 start server.js --name "genzchat"

# Agar otomatis start saat reboot
pm2 startup
pm2 save

# Cek status
pm2 status

# Lihat log
pm2 logs genzchat
```

---

## 📖 Dokumentasi Fitur

### 🔐 Autentikasi

**Register**
1. Buka `/register`
2. Isi username, email, dan password
3. Tekan "Kirim OTP" — kode OTP dikirim ke email
4. Masukkan OTP untuk verifikasi
5. Akun berhasil dibuat

**Login**
1. Buka `/login`
2. Masukkan email dan password
3. Redirect ke dashboard jika berhasil

---

### 💬 Chat

**Chat Pribadi**
- Dari dashboard, cari user lain dan mulai chat
- Mendukung teks, emoji, dan upload gambar/file

**Chat Grup**
- Buat grup baru dari menu chat
- Upload icon grup (opsional)
- Bagikan **kode undangan** agar orang lain bisa bergabung
- Bergabung dengan kode: `/join-group/:kode`

**Fitur di dalam Room:**
- Pin pesan penting
- Upload file/gambar
- Notifikasi real-time via Socket.IO & Push Notification

---

### 🎵 Ruang Musik

- Buka `/music-list` untuk daftar sesi musik
- Buat sesi baru sebagai host
- Pendengar lain bisa bergabung dan mendengarkan musik yang sama secara sinkron
- Tersedia fitur chat di dalam ruang musik

---

### 🎨 Live Doodles

- Buka `/doodles` untuk daftar papan gambar
- Buat papan baru lalu gambar bersama secara real-time
- Semua goresan disinkronkan via Socket.IO

---

### 👑 Panel Admin

Akses panel admin di `/admin` (hanya untuk user dengan role `admin`).

**Fitur Admin:**
- **Manajemen User**: Lihat, buat, edit, ban, dan hapus user
- **Assign Role**: Ubah role user dengan durasi waktu (opsional)
- **Broadcast**: Kirim pesan siaran ke semua user
- **Kelola Role**: Buat, edit, dan hapus role kustom dengan warna & permission
- **Maintenance Mode**: Toggle mode maintenance — user biasa tidak bisa akses selama aktif

---

### 👤 Dashboard & Profil

- Lihat daftar teman dan permintaan pertemanan
- Update foto profil dan bio (moots)
- Ganti username dari dashboard

---

## 🗺 Route & Endpoint

### Halaman Utama

| Method | Route | Deskripsi |
|--------|-------|-----------|
| GET | `/` | Redirect ke dashboard atau login |
| GET | `/login` | Halaman login |
| POST | `/login` | Proses login |
| GET | `/register` | Halaman registrasi |
| POST | `/send-otp` | Kirim OTP ke email |
| POST | `/register` | Proses registrasi dengan OTP |
| GET | `/logout` | Logout user |

### Dashboard & Profil

| Method | Route | Deskripsi |
|--------|-------|-----------|
| GET | `/dashboard` | Halaman utama setelah login |
| POST | `/update-profile` | Update foto profil & bio |
| POST | `/update-username` | Ganti username |

### Chat

| Method | Route | Deskripsi |
|--------|-------|-----------|
| GET | `/chat` | Daftar semua chat |
| GET | `/chat/:roomId` | Masuk ke room chat |
| POST | `/chat/create-private` | Buat chat pribadi |
| POST | `/chat/create-group` | Buat grup baru |
| POST | `/chat/upload` | Upload file di chat |
| GET | `/join-group/:code` | Bergabung ke grup via kode |
| POST | `/chat/update-group-icon` | Update icon grup |

### Musik & Doodles

| Method | Route | Deskripsi |
|--------|-------|-----------|
| GET | `/music-list` | Daftar sesi musik |
| GET | `/music/:id` | Masuk ke sesi musik |
| POST | `/music/upload` | Upload file musik |
| POST | `/music/delete` | Hapus sesi musik |
| GET | `/doodles` | Daftar papan doodle |
| POST | `/doodle/create` | Buat papan baru |
| GET | `/doodle/:id` | Masuk ke papan doodle |
| POST | `/doodle/delete` | Hapus papan doodle |

### Admin

| Method | Route | Deskripsi |
|--------|-------|-----------|
| GET | `/admin` | Panel admin |
| POST | `/admin/create-user` | Buat user baru |
| POST | `/admin/delete-user` | Hapus user |
| POST | `/admin/ban-user` | Ban/unban user |
| POST | `/admin/update-user` | Update data user |
| POST | `/admin/broadcast` | Kirim broadcast |
| POST | `/admin/create-role` | Buat role baru |
| POST | `/admin/delete-role` | Hapus role |
| POST | `/admin/toggle-maintenance` | Toggle maintenance mode |

### API

| Method | Route | Deskripsi |
|--------|-------|-----------|
| POST | `/api/login` | Login via API |
| POST | `/api/request-otp` | Request OTP via API |
| POST | `/api/register-verify` | Verifikasi registrasi via API |
| POST | `/api/upload` | Upload file via API |

---

## 🔧 Perintah Utilitas

### Reset Aplikasi

> ⚠️ **PERINGATAN**: Perintah ini akan **menghapus semua data**, termasuk database, upload, dan session!

```bash
node reset.js
```

Setelah reset, lakukan setup ulang:

```bash
node setup.js --build
node server.js
```

### Membuat User Pertama / Admin

```bash
node setup.js --build
```

---

## 🗄 Database Schema

GenZChat menggunakan **SQLite** dengan file `database/genzchat.db`.

### Tabel `users`

| Kolom | Tipe | Keterangan |
|-------|------|------------|
| `id` | TEXT | UUID, Primary Key |
| `username` | TEXT | Username unik |
| `email` | TEXT | Email unik |
| `password` | TEXT | Bcrypt hash |
| `role` | TEXT | `admin` atau `user` |
| `banned` | INTEGER | `0` = aktif, `1` = banned |
| `data` | JSON | profilePic, friends, blocked, moots, dll |

### Tabel `rooms`

| Kolom | Tipe | Keterangan |
|-------|------|------------|
| `id` | TEXT | UUID, Primary Key |
| `type` | TEXT | `private` atau `group` |
| `members` | JSON | Array member ID |
| `messages` | JSON | Array pesan |
| `settings` | JSON | Nama grup, icon, inviteCode, dll |

### Tabel `music_sessions`

| Kolom | Tipe | Keterangan |
|-------|------|------------|
| `id` | TEXT | Primary Key |
| `hostId` | TEXT | ID host sesi |
| `playlist` | JSON | Daftar musik |
| `chat` | JSON | Pesan di ruang musik |

### Tabel `doodles`

| Kolom | Tipe | Keterangan |
|-------|------|------------|
| `id` | TEXT | Primary Key |
| `creatorId` | TEXT | ID pembuat |
| `lines` | JSON | Data goresan gambar |

### Tabel `otp`

| Kolom | Tipe | Keterangan |
|-------|------|------------|
| `email` | TEXT | Primary Key |
| `code` | TEXT | Kode OTP |
| `expires` | INTEGER | Unix timestamp kadaluarsa |

### Tabel `system_settings`

| Kolom | Tipe | Keterangan |
|-------|------|------------|
| `key` | TEXT | Nama setting |
| `value` | JSON | Nilai setting |

### Tabel `roles`

| Kolom | Tipe | Keterangan |
|-------|------|------------|
| `id` | TEXT | Primary Key |
| `name` | TEXT | Nama role |
| `color` | TEXT | Warna (hex/gradient) |
| `canRgb` | INTEGER | Boleh RGB? 0/1 |
| `canGif` | INTEGER | Boleh GIF? 0/1 |

---

## ❓ Troubleshooting

**`Error: better-sqlite3` gagal install**
```bash
# Install build tools (Linux)
sudo apt-get install build-essential python3

# Windows: Install Visual Studio Build Tools
npm install --global --production windows-build-tools
```

**Port sudah dipakai**
```bash
# Ganti PORT di .env
PORT=8080
```

**Email OTP tidak terkirim**
- Pastikan `EMAIL_USER` dan `EMAIL_PASS` sudah diisi di `.env`
- Gunakan **App Password** Gmail, bukan password biasa
- Cek apakah 2FA sudah aktif di akun Google

**Session tidak tersimpan**
- Pastikan folder `sessions/` sudah ada
- Cek permission folder

**Database tidak ditemukan**
- Pastikan folder `database/` sudah dibuat
- Jalankan `node server.js` — database akan otomatis dibuat

**Lupa password admin**
```bash
# Reset semua data (hati-hati!)
node reset.js

# Buat admin baru
node setup.js --build
```

---

## 📝 Lisensi

ISC License

---

*Dibuat dengan ❤️ menggunakan Node.js + Socket.IO*
