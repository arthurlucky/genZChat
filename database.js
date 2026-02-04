// database.js
const Database = require('better-sqlite3');
const path = require('path');

// Bikin file .db di folder database
const dbPath = path.join(__dirname, 'database', 'genzchat.db');
const db = new Database(dbPath);

// 1. SETUP TABEL (Hanya perlu dijalankan sekali saat start)
// Kita simpan data kompleks (friends, messages) sebagai JSON Text biar simpel
db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT,
        email TEXT,
        password TEXT,
        role TEXT DEFAULT 'user',
        banned INTEGER DEFAULT 0,
        data JSON -- Simpan profilePic, friends, blocked, moots disini
    );

    CREATE TABLE IF NOT EXISTS rooms (
        id TEXT PRIMARY KEY,
        type TEXT,
        members JSON,
        messages JSON, -- Array pesan disimpan sebagai JSON string
        settings JSON
    );
    
    CREATE TABLE IF NOT EXISTS music_sessions (
        id TEXT PRIMARY KEY,
        hostId TEXT,
        playlist JSON,
        chat JSON
    );

    CREATE TABLE IF NOT EXISTS doodles (
        id TEXT PRIMARY KEY,
        creatorId TEXT,
        lines JSON
    );
`);

console.log('[DB] SQLite Database Connected & Ready');
module.exports = db;