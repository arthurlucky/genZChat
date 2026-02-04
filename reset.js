const fs = require('fs');
const path = require('path');

// --- KONFIGURASI PATH ---
// Target ke database SQLite, bukan data.json lagi
const dbPath = path.join(__dirname, 'database', 'genzchat.db'); 
const oldDbPath = path.join(__dirname, 'database', 'data.json'); // Bersihkan sisa legacy juga

const uploadsPath = path.join(__dirname, 'public', 'uploads');
const sessionsPath = path.join(__dirname, 'sessions'); 

console.log('\n🔄 MEMULAI PROSES RESET SYSTEM (SQLITE VERSION)...\n');

// 1. RESET DATABASE (HAPUS FILE .DB)
try {
    let deleted = false;

    // Hapus Database SQLite Utama
    if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
        console.log('✅ Database SQLite (genzchat.db) berhasil dihapus.');
        deleted = true;
    }

    // Hapus Sisa JSON Lama (Jika ada)
    if (fs.existsSync(oldDbPath)) {
        fs.unlinkSync(oldDbPath);
        console.log('🗑️  Sisa database lama (data.json) berhasil dibersihkan.');
        deleted = true;
    }

    if (!deleted) {
        console.log('ℹ️  Tidak ada database yang ditemukan untuk dihapus.');
    } else {
        console.log('   (Database akan dibuat ulang otomatis saat server dijalankan)');
    }

} catch (err) {
    console.error('❌ Gagal mereset database:', err.message);
}

// 2. BERSIHKAN FOLDER UPLOADS
try {
    if (fs.existsSync(uploadsPath)) {
        const files = fs.readdirSync(uploadsPath);
        let deletedCount = 0;
        for (const file of files) {
            // Hapus semua file kecuali .gitkeep
            if (file !== '.gitkeep') { 
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

// 3. BERSIHKAN SESI LOGIN
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

console.log('\n✨ RESET SELESAI!');
console.log('👉 Langkah selanjutnya:');
console.log('1. Jalankan: node setup.js --build (Untuk buat admin baru)');
console.log('2. Jalankan: node server.js\n');
