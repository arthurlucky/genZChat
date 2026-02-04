const fs = require('fs');
const path = require('path');

// --- KONFIGURASI PATH ---
const dbPath = path.join(__dirname, 'database', 'data.json');
const uploadsPath = path.join(__dirname, 'public', 'uploads');
const sessionsPath = path.join(__dirname, 'sessions'); // TAMBAHAN: Folder Sesi

// --- DATA DEFAULT (Initial State) ---
const defaultData = {
    users: [],
    rooms: [],
    otp: [],
    roles: [
        { 
            id: 'admin', 
            name: 'admin', 
            color: 'linear-gradient(to right, #ff00cc, #333399)', 
            canRgb: true, 
            canGif: true 
        },
        { 
            id: 'user', 
            name: 'user', 
            color: '#ffffff', 
            canRgb: false, 
            canGif: false 
        }
    ]
};

console.log('\n🔄 MEMULAI PROSES RESET SYSTEM...\n');

// 1. RESET DATABASE
try {
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

    fs.writeFileSync(dbPath, JSON.stringify(defaultData, null, 2));
    console.log('✅ Database (data.json) berhasil di-reset.');
} catch (err) {
    console.error('❌ Gagal mereset database:', err.message);
}

// 2. BERSIHKAN FOLDER UPLOADS
try {
    if (fs.existsSync(uploadsPath)) {
        const files = fs.readdirSync(uploadsPath);
        let deletedCount = 0;
        for (const file of files) {
            if (file !== '.gitkeep') { // Jangan hapus .gitkeep
                fs.unlinkSync(path.join(uploadsPath, file));
                deletedCount++;
            }
        }
        console.log(`✅ Folder Uploads dibersihkan (${deletedCount} file dihapus).`);
    } else {
        fs.mkdirSync(uploadsPath, { recursive: true });
        console.log('✅ Folder Uploads dibuat baru.');
    }
} catch (err) {
    console.error('❌ Gagal membersihkan uploads:', err.message);
}

// 3. BERSIHKAN SESI LOGIN (TAMBAHAN PENTING)
try {
    if (fs.existsSync(sessionsPath)) {
        // Hapus folder sessions beserta isinya
        fs.rmSync(sessionsPath, { recursive: true, force: true });
        // Buat ulang folder kosong
        fs.mkdirSync(sessionsPath);
        console.log('✅ Folder Sessions berhasil dikosongkan (Semua user logout).');
    } else {
        fs.mkdirSync(sessionsPath);
        console.log('✅ Folder Sessions dibuat baru.');
    }
} catch (err) {
    console.error('❌ Gagal membersihkan sessions:', err.message);
}

console.log('\n✨ RESET SELESAI! Silakan jalankan "npm start" dan daftar akun baru.\n');
