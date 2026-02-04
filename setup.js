/**
 * ===========================================================================================
 * GENZCHAT SETUP - SQLITE VERSION
 * ===========================================================================================
 * Creates initial user directly into SQLite Database
 * ===========================================================================================
 */
require('dotenv').config();
const readline = require('readline-sync');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

// Import koneksi database SQLite yang sudah ada
const db = require('./database'); 

const args = process.argv.slice(2);

if (args.includes('--build')) {
    console.log('\n=== GENZCHAT SETUP BUILD (SQLITE) ===');
    console.log('Membuat User Pertama...\n');

    const username = readline.question('-> username: ');
    const email = readline.question('-> email: ');
    const password = readline.question('-> password: ', { hideEchoBack: true });
    const isAdmin = readline.keyInYN('-> admin y/n? ');

    // 1. Cek Duplikat di SQLite
    const checkUser = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email);
    
    if(checkUser) {
        console.log('\n[ERROR] Username atau Email sudah terdaftar di database!');
        process.exit(1);
    }

    // 2. Persiapan Data
    const id = uuidv4();
    const hashedPassword = bcrypt.hashSync(password, 10);
    const role = isAdmin ? 'admin' : 'user';

    // Data tambahan yang masuk ke kolom JSON 'data' (sesuai struktur server.js)
    const extraData = {
        profilePic: `https://ui-avatars.com/api/?name=${username}`,
        friends: [],
        friendRequests: [],
        blocked: [],
        createdAt: new Date(),
        moots: { 
            text: "Hello World", 
            color: isAdmin ? 'linear-gradient(to right, #ff00cc, #333399)' : '#888' 
        }
    };

    // 3. Insert ke SQLite
    try {
        const insertStmt = db.prepare(`
            INSERT INTO users (id, username, email, password, role, banned, data)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        insertStmt.run(
            id, 
            username, 
            email, 
            hashedPassword, 
            role, 
            0, // Not banned
            JSON.stringify(extraData) // Data JSON
        );

        console.log('\n[SUCCESS] User created in SQLite database!');
        console.log('Jalankan aplikasi dengan: node server.js');
    } catch (err) {
        console.error('\n[FAILED] Gagal menyimpan ke database:', err.message);
    }
} else {
    console.log('Gunakan flag --build untuk memulai setup.');
    console.log('Contoh: node setup.js --build');
}
