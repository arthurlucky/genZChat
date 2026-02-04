/**
 * ===========================================================================================
 * GENZCHAT SERVER - SQLITE ULTIMATE VERSION
 * ===========================================================================================
 * Migrated from JSON File System to SQLite (better-sqlite3)
 * Preserves all features: Auth, Chat, Music, Doodles, Admin, Push Notifs.
 * ===========================================================================================
 */
require('dotenv').config()
const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: { origin: "*" }
});
const session = require('express-session');
// Gunakan memory store atau connect-sqlite3 untuk production, 
// tapi FileStore masih oke untuk development.
const FileStore = require('session-file-store')(session);
const flash = require('connect-flash');
const multer = require('multer');
const path = require('path');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const webpush = require('web-push');
const bodyParser = require('body-parser');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');

// IMPORT DATABASE SQLITE
const db = require('./database'); // Pastikan database.js ada di folder yang sama

// ============================================================
// 0. TAMBAHAN SCHEMA (OTP & SETTINGS)
// ============================================================
// Kita perlu tabel tambahan untuk OTP dan Settings yang tidak ada di database.js awal
db.exec(`
    CREATE TABLE IF NOT EXISTS otp (
        email TEXT PRIMARY KEY,
        code TEXT,
        expires INTEGER
    );
    
    CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY,
        value JSON
    );
    
    CREATE TABLE IF NOT EXISTS roles (
        id TEXT PRIMARY KEY,
        name TEXT,
        color TEXT,
        canRgb INTEGER, -- Boolean stored as 0/1
        canGif INTEGER
    );
`);

// Inisialisasi Settings Default
const initSettings = db.prepare("SELECT * FROM system_settings WHERE key = 'maintenance'").get();
if (!initSettings) {
    db.prepare("INSERT INTO system_settings (key, value) VALUES (?, ?)").run('maintenance', JSON.stringify({ active: false }));
}

// Inisialisasi Roles Default
const initRoles = db.prepare("SELECT count(*) as count FROM roles").get();
if (initRoles.count === 0) {
    const insertRole = db.prepare("INSERT INTO roles (id, name, color, canRgb, canGif) VALUES (?, ?, ?, ?, ?)");
    insertRole.run('admin', 'admin', 'linear-gradient(to right, #ff00cc, #333399)', 1, 1);
    insertRole.run('user', 'user', '#ffffff', 0, 0);
}

// ============================================================
// 1. DATABASE HELPER FUNCTIONS (THE CORE ADAPTER)
// ============================================================

// --- USER HELPERS ---
// Mengambil user dan menggabungkan kolom biasa dengan kolom JSON 'data'
function getUser(identifier, type = 'id') {
    let row;
    if (type === 'id') row = db.prepare('SELECT * FROM users WHERE id = ?').get(identifier);
    else if (type === 'email') row = db.prepare('SELECT * FROM users WHERE email = ?').get(identifier);
    else if (type === 'username') row = db.prepare('SELECT * FROM users WHERE username = ?').get(identifier);

    if (!row) return null;

    // Parse JSON data (friends, blocked, profilePic, moots, dll ada disini)
    const extraData = JSON.parse(row.data || '{}');
    
    // Pastikan array penting ada
    if (!extraData.friends) extraData.friends = [];
    if (!extraData.friendRequests) extraData.friendRequests = [];
    if (!extraData.blocked) extraData.blocked = [];
    if (!extraData.moots) extraData.moots = { text: "Hi there!", color: "#888" };

    return { ...row, ...extraData, data: undefined }; // Flatten object
}

// Menyimpan user kembali ke DB (memecah kolom biasa dan JSON)
function saveUser(userObj) {
    // Pisahkan field tabel murni vs field JSON
    const { id, username, email, password, role, banned, roleExpiresAt, ...rest } = userObj;
    
    // 'rest' berisi profilePic, friends, blocked, dll -> Masuk ke kolom 'data'
    const jsonData = JSON.stringify(rest);
    
    const stmt = db.prepare(`
        UPDATE users 
        SET username=?, email=?, password=?, role=?, banned=?, data=?
        WHERE id=?
    `);
    stmt.run(username, email, password, role, banned ? 1 : 0, jsonData, id);
    
    // Handle role expiry (opsional, simpan di data atau tambah kolom jika perlu)
    // Disini kita anggap roleExpiresAt masuk ke 'data' JSON di atas (inside ...rest) 
    // kecuali kita alter table. Di kode ini, roleExpiresAt masuk ke JSON data.
}

function createUser(userObj) {
    const { id, username, email, password, role, banned, ...rest } = userObj;
    const jsonData = JSON.stringify(rest);
    db.prepare(`
        INSERT INTO users (id, username, email, password, role, banned, data)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, username, email, password, role, banned ? 1 : 0, jsonData);
}

// --- ROOM HELPERS ---
function getRoom(id) {
    const row = db.prepare('SELECT * FROM rooms WHERE id = ?').get(id);
    if (!row) return null;
    
    return {
        id: row.id,
        type: row.type,
        members: JSON.parse(row.members || '[]'),
        messages: JSON.parse(row.messages || '[]'),
        settings: JSON.parse(row.settings || '{}'),
        // Tambahan field virtual untuk kompatibilitas
        name: row.type === 'group' ? (JSON.parse(row.settings).name || 'Group') : null,
        icon: row.type === 'group' ? (JSON.parse(row.settings).icon || '') : null,
        inviteCode: JSON.parse(row.settings).inviteCode || null,
        pinnedMessageId: JSON.parse(row.settings).pinnedMessageId || null
    };
}

// Karena skema database.js hanya punya id, type, members, messages, settings
// Kita harus memasukkan name, icon, inviteCode ke dalam 'settings' atau logic lain.
// Di kode ini, saya akan menyimpan name/icon group ke dalam 'settings' agar sesuai skema,
// ATAU kita ubah cara save-nya.
// *FIX:* Untuk mempermudah, saya asumsikan 'settings' di DB menyimpan metadata room juga.

function saveRoom(roomObj) {
    // Kembalikan struktur flat roomObj ke struktur DB
    // roomObj di server.js punya property: id, type, name, icon, members, messages, settings, inviteCode
    
    const settingsObj = roomObj.settings || {};
    // Inject properti top-level yang tidak punya kolom sendiri ke settings JSON
    if(roomObj.name) settingsObj.name = roomObj.name;
    if(roomObj.icon) settingsObj.icon = roomObj.icon;
    if(roomObj.inviteCode) settingsObj.inviteCode = roomObj.inviteCode;
    if(roomObj.pinnedMessageId) settingsObj.pinnedMessageId = roomObj.pinnedMessageId;

    db.prepare(`
        UPDATE rooms 
        SET members=?, messages=?, settings=?
        WHERE id=?
    `).run(
        JSON.stringify(roomObj.members),
        JSON.stringify(roomObj.messages),
        JSON.stringify(settingsObj),
        roomObj.id
    );
}

function createRoom(roomObj) {
    const settingsObj = roomObj.settings || {};
    if(roomObj.name) settingsObj.name = roomObj.name;
    if(roomObj.icon) settingsObj.icon = roomObj.icon;
    if(roomObj.inviteCode) settingsObj.inviteCode = roomObj.inviteCode;

    db.prepare(`
        INSERT INTO rooms (id, type, members, messages, settings)
        VALUES (?, ?, ?, ?, ?)
    `).run(
        roomObj.id,
        roomObj.type,
        JSON.stringify(roomObj.members),
        JSON.stringify(roomObj.messages),
        JSON.stringify(settingsObj)
    );
}

// --- SYSTEM & ROLES ---
function getRoles() {
    return db.prepare("SELECT * FROM roles").all().map(r => ({
        ...r, canRgb: !!r.canRgb, canGif: !!r.canGif
    }));
}
function getMaintenance() {
    const row = db.prepare("SELECT value FROM system_settings WHERE key='maintenance'").get();
    return row ? JSON.parse(row.value).active : false;
}
function setMaintenance(status) {
    db.prepare("UPDATE system_settings SET value=? WHERE key='maintenance'").run(JSON.stringify({ active: status }));
}

// --- HELPER TAMBAHAN (Wajib untuk fitur Join/Group) ---
function createSystemMessage(roomId, text) {
    const row = db.prepare('SELECT messages FROM rooms WHERE id = ?').get(roomId);
    if (!row) return;

    const messages = JSON.parse(row.messages || '[]');
    const msg = {
        id: uuidv4(), 
        userId: 'system', 
        username: 'System', 
        pic: '',
        type: 'system', 
        content: text,
        timestamp: Date.now(), 
        time: new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}),
        readBy: [], 
        reactions: {}
    };

    messages.push(msg);
    // Update kolom messages saja
    db.prepare('UPDATE rooms SET messages = ? WHERE id = ?').run(JSON.stringify(messages), roomId);
    io.to(roomId).emit('receive_message', msg);
}




// ============================================================
// 2. CONFIGURATION & SETUP
// ============================================================
const PORT = process.env.PORT || 3000;

// VAPID KEYS (Push Notification)
const publicVapidKey = 'BD7m1QPVkSf8e8mNmgyZVX5lBWVAXGzZJKstRoeybfKZlZ_wHCfkJZwa69c1L9z5jZnEus55yHvNpWRVn85ULt0';
const privateVapidKey = 'ohI3qpuCWvOMtD-3AMOPFkgiCJxsMrfvHOjQkzFBgj0';

webpush.setVapidDetails('mailto:brotherlupin@gmail.com', publicVapidKey, privateVapidKey);

app.set('view engine', 'ejs');
app.use(cors());
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(bodyParser.json());

app.use(session({
    store: new FileStore({ path: './sessions', ttl: 86400 * 30, retries: 0 }),
    secret: process.env.SESSION_SECRET || 'rahasia_negara',
    resave: true,
    saveUninitialized: true,
    cookie: { maxAge: 30 * 24 * 60 * 60 * 1000, httpOnly: true, secure: false }
}));
app.use(flash());

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = './public/uploads/';
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        cb(null, 'media-' + Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage });

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { 
        user: process.env.EMAIL_USER, 
        pass: process.env.EMAIL_PASS 
    }
});

let onlineUsers = new Set(); 
let musicRoomUsers = {}

// ============================================================
// 3. AUTO DELETE MESSAGES (CRON)
// ============================================================
setInterval(() => {
    // Ambil semua room, cek expired
    const rooms = db.prepare("SELECT * FROM rooms").all();
    const now = Date.now();

    rooms.forEach(rawRoom => {
        const settings = JSON.parse(rawRoom.settings || '{}');
        if (settings.expiresIn && settings.expiresIn > 0) {
            let messages = JSON.parse(rawRoom.messages || '[]');
            const originalLen = messages.length;
            const pinnedId = settings.pinnedMessageId;

            messages = messages.filter(msg => {
                if (msg.type === 'system') return true;
                if (msg.id === pinnedId) return true;
                return (now - msg.timestamp) < settings.expiresIn;
            });

            if (messages.length !== originalLen) {
                db.prepare("UPDATE rooms SET messages = ? WHERE id = ?")
                  .run(JSON.stringify(messages), rawRoom.id);
            }
        }
    });
}, 60 * 1000);

// ============================================================
// 4. MIDDLEWARE SECURITY
// ============================================================

const protect = (req, res, next) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    
    // Refresh data from DB
    const freshUser = getUser(req.session.user.id);
    
    if (!freshUser) {
        req.session.destroy();
        return res.redirect('/login');
    }
    
    if (freshUser.banned) {
        req.session.destroy();
        return res.send('<h1 style="color:red;text-align:center">AKUN ANDA DIBANNED!</h1>');
    }

    // Cek Role Expired
    if (freshUser.roleExpiresAt && Date.now() > freshUser.roleExpiresAt) {
        if (freshUser.role !== 'user') {
            freshUser.role = 'user';
            freshUser.roleExpiresAt = null;
            saveUser(freshUser);
        }
    }

    req.session.user = freshUser;
    next();
};

const adminOnly = (req, res, next) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.redirect('/dashboard');
    }
    next();
};

app.use((req, res, next) => {
    const isMaintenance = getMaintenance();
    const allowedUrls = ['/login', '/admin', '/logout', '/maintenance', '/api/login', '/api/request-otp'];
    const isStatic = req.path.startsWith('/css') || req.path.startsWith('/js') || req.path.startsWith('/uploads');
    const isAdmin = req.session.user && req.session.user.role === 'admin';

    if (isMaintenance && !isAdmin && !allowedUrls.includes(req.path) && !isStatic && !req.path.startsWith('/admin') && !req.path.startsWith('/api')) {
        return res.render('maintenance'); 
    }
    next();
});

// ============================================================
// 5. API ROUTES
// ============================================================

app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    const user = getUser(email, 'email');

    if (!user || !bcrypt.compareSync(password, user.password)) {
        return res.json({ success: false, message: 'Email atau Password Salah' });
    }
    if (user.banned) {
        return res.json({ success: false, message: 'AKUN ANDA DIBANNED!' });
    }

    res.json({ 
        success: true, 
        message: 'Login Sukses',
        user: { id: user.id, username: user.username, email: user.email, profilePic: user.profilePic }
    });
});

app.post('/api/request-otp', async (req, res) => {
    const { email } = req.body;
    if (getUser(email, 'email')) {
        return res.json({ success: false, message: 'Email sudah terdaftar!' });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = Date.now() + 5 * 60 * 1000;

    // Save/Update OTP
    db.prepare("INSERT OR REPLACE INTO otp (email, code, expires) VALUES (?, ?, ?)")
      .run(email, code, expires);

    try {
        await transporter.sendMail({
            from: '"GenZChat', to: email, 
            subject: 'Kode OTP', text: `Kode OTP: ${code}`
        });
        res.json({ success: true, message: 'OTP Terkirim' });
    } catch (e) { 
        res.json({ success: false, message: 'Gagal kirim email' }); 
    }
});

app.post('/api/register-verify', (req, res) => {
    const { username, email, password, otp } = req.body;
    
    const otpRow = db.prepare("SELECT * FROM otp WHERE email = ? AND code = ?").get(email, otp);
    
    if (!otpRow) return res.json({ success: false, message: 'OTP Salah' });
    if (Date.now() > otpRow.expires) return res.json({ success: false, message: 'OTP Kadaluarsa' });

    const newUser = {
        id: uuidv4(), 
        username, email, 
        password: bcrypt.hashSync(password, 10),
        role: 'user', banned: false, 
        profilePic: `https://ui-avatars.com/api/?name=${username}`,
        moots: { text: "New User", color: "#888", expires: null }, 
        friends: [], friendRequests: [], blocked: [], createdAt: new Date()
    };
    
    createUser(newUser);
    db.prepare("DELETE FROM otp WHERE email = ?").run(email);
    
    res.json({ success: true, message: 'Register Berhasil', user: newUser });
});

app.post('/api/upload', upload.single('file'), (req, res) => {
    if (!req.file) return res.json({ success: false, message: 'No file' });
    let type = 'file';
    if (req.file.mimetype.startsWith('image')) type = 'image';
    else if (req.file.mimetype.startsWith('video')) type = 'video';
    else if (req.file.mimetype.startsWith('audio')) type = 'audio';
    
    res.json({ success: true, filePath: `/uploads/${req.file.filename}`, fileName: req.file.originalname, type });
});

// ============================================================
// 6. WEB ROUTES (EJS)
// ============================================================

app.get('/', (req, res) => {
    req.session.user ? res.redirect('/dashboard') : res.redirect('/login');
});

app.get('/login', (req, res) => {
    res.render('login', { msg: req.flash('error') });
});

app.post('/login', (req, res) => {
    const user = getUser(req.body.email, 'email');
    
    if (!user || !bcrypt.compareSync(req.body.password, user.password)) {
        req.flash('error', 'Email atau Password Salah'); 
        return res.redirect('/login');
    }
    
    if (user.banned) return res.send('<h1 style="color:red">AKUN DIBANNED!</h1>');
    
    req.session.user = user; 
    res.redirect('/dashboard');
});

app.get('/register', (req, res) => res.render('register'));

app.post('/send-otp', async (req, res) => {
    const { email } = req.body;
    const code = Math.floor(100000 + Math.random() * 900000);
    const expires = Date.now() + 300000;
    
    db.prepare("INSERT OR REPLACE INTO otp (email, code, expires) VALUES (?, ?, ?)")
      .run(email, code, expires);
    
    try { 
        await transporter.sendMail({ from: '"GenZChat"', to: email, subject: 'OTP', text: `Kode: ${code}` }); 
        res.json({ success: true }); 
    } catch(e) { 
        res.json({ success: false }); 
    }
});

app.post('/register', (req, res) => {
    const { username, email, password, otp } = req.body;
    const otpRow = db.prepare("SELECT * FROM otp WHERE email = ? AND code = ?").get(email, otp);
    
    if (!otpRow || Date.now() > otpRow.expires) {
        return res.send('<script>alert("OTP Salah/Kadaluarsa"); window.location="/register"</script>');
    }
    
    const newUser = {
        id: uuidv4(), username, email,
        password: bcrypt.hashSync(password, 10), 
        role: 'user', banned: false,
        profilePic: `https://ui-avatars.com/api/?name=${username}`,
        moots: { text: "Hi! I am new here.", color: "#888" }, 
        friends: [], friendRequests: [], blocked: [], createdAt: new Date()
    };
    
    createUser(newUser);
    db.prepare("DELETE FROM otp WHERE email = ?").run(email);
    res.redirect('/login');
});

app.get('/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/login'));
});

// --- DASHBOARD ---
app.get('/dashboard', protect, (req, res) => {
    const user = getUser(req.session.user.id);
    
    // Fetch Friend Data
    let friends = [];
    if(user.friends.length > 0) {
        // Create placeholders ?,?,? for SQL IN clause
        const placeholders = user.friends.map(() => '?').join(',');
        const rows = db.prepare(`SELECT * FROM users WHERE id IN (${placeholders})`).all(...user.friends);
        friends = rows.map(r => ({ ...r, ...JSON.parse(r.data) }));
    }

    let requests = [];
    if(user.friendRequests.length > 0) {
        const placeholders = user.friendRequests.map(() => '?').join(',');
        const rows = db.prepare(`SELECT * FROM users WHERE id IN (${placeholders})`).all(...user.friendRequests);
        requests = rows.map(r => ({ ...r, ...JSON.parse(r.data) }));
    }
    
    const allRoles = getRoles();
    const myPermission = allRoles.find(r => r.name === user.role) || allRoles.find(r => r.name === 'user');

    req.session.user = user; 
    res.render('dashboard', { user, roleData: myPermission, friends, requests });
});

app.post('/update-profile', protect, upload.single('profilePic'), (req, res) => {
    const u = getUser(req.session.user.id);
    const newName = req.body.username || req.body.newUsername;

    // Update Username
    if (newName && newName !== u.username) {
        const exist = getUser(newName, 'username');
        if (!exist) {
            u.username = newName;
            if (u.profilePic.includes('ui-avatars.com') && !req.file) {
                u.profilePic = `https://ui-avatars.com/api/?name=${newName}`;
            }
        }
    }
    // Update Photo
    if (req.file) u.profilePic = `/uploads/${req.file.filename}`;
    
    // Update Moots
    if (req.body.mootsText) u.moots.text = req.body.mootsText;
    
    const allRoles = getRoles();
    const p = allRoles.find(r => r.name === u.role) || allRoles.find(r => r.name === 'user');
    
    if (p.canRgb && req.body.isRainbow === 'on') u.moots.color = 'rainbow';
    else if (req.body.mootsColor) u.moots.color = req.body.mootsColor;
    
    saveUser(u);
    req.session.user = u;
    res.redirect('/dashboard');
});

// ============================================================
// 7. MUSIC & DOODLE ROUTES
// ============================================================

app.get('/music-list', protect, (req, res) => {
    const myId = req.session.user.id;
    const rows = db.prepare("SELECT * FROM music_sessions WHERE hostId = ?").all(myId);
    
    const sessions = rows.map(s => {
        const host = getUser(s.hostId);
        return {
            id: s.id,
            hostId: s.hostId,
            hostName: host ? host.username : 'Unknown',
            // Playlist & Chat stored as JSON strings
            playlist: JSON.parse(s.playlist || '[]'),
            chat: JSON.parse(s.chat || '[]')
        };
    }).reverse();
    
    res.render('music_list', { user: req.session.user, sessions });
});

app.get('/create-music', protect, (req, res) => {
    const roomId = uuidv4();
    db.prepare(`
        INSERT INTO music_sessions (id, hostId, playlist, chat)
        VALUES (?, ?, ?, ?)
    `).run(roomId, req.session.user.id, '[]', '[]');
    
    res.redirect(`/music/${roomId}`);
});

app.get('/music/:id', protect, (req, res) => {
    const row = db.prepare("SELECT * FROM music_sessions WHERE id = ?").get(req.params.id);
    if(!row) return res.redirect('/dashboard');
    
    res.render('ruangmusik', { 
        user: req.session.user, 
        roomId: row.id,
        playlist: JSON.parse(row.playlist || '[]')
    });
});

app.post('/music/upload', protect, upload.single('musicFile'), (req, res) => {
    if(!req.file) return res.json({success: false});
    const { roomId } = req.body;
    
    const row = db.prepare("SELECT * FROM music_sessions WHERE id = ?").get(roomId);
    if(row) {
        const playlist = JSON.parse(row.playlist || '[]');
        const newSong = {
            id: uuidv4(),
            url: `/uploads/${req.file.filename}`,
            title: req.file.originalname.replace(/\.[^/.]+$/, ""),
            uploader: req.session.user.username
        };
        playlist.push(newSong);
        
        db.prepare("UPDATE music_sessions SET playlist = ? WHERE id = ?")
          .run(JSON.stringify(playlist), roomId);
          
        io.to(`music_${roomId}`).emit('playlist_update', playlist);
        res.json({success: true});
    } else {
        res.json({success: false});
    }
});

app.post('/music/delete', protect, (req, res) => {
    const { roomId } = req.body;
    const row = db.prepare("SELECT * FROM music_sessions WHERE id = ?").get(roomId);
    
    if (row && (row.hostId === req.session.user.id || req.session.user.role === 'admin')) {
        const playlist = JSON.parse(row.playlist || '[]');
        playlist.forEach(song => {
            try {
                const fp = path.join(__dirname, 'public', song.url);
                if (fs.existsSync(fp)) fs.unlinkSync(fp);
            } catch(e){}
        });
        db.prepare("DELETE FROM music_sessions WHERE id = ?").run(roomId);
    }
    res.redirect('/music-list');
});

// --- DOODLES ---
app.get('/doodles', protect, (req, res) => {
    const rows = db.prepare("SELECT * FROM doodles").all();
    const doodles = rows.map(d => {
        const creator = getUser(d.creatorId);
        return {
            id: d.id,
            name: d.id, // Simplifikasi, nama bisa disimpan di JSON lines jika mau kompleks
            creatorId: d.creatorId,
            creatorName: creator ? creator.username : 'Unknown',
            lines: JSON.parse(d.lines || '[]')
        };
    }).reverse();
    res.render('doodle_list', { user: req.session.user, doodles });
});

app.post('/doodle/create', protect, (req, res) => {
    const id = uuidv4();
    db.prepare("INSERT INTO doodles (id, creatorId, lines) VALUES (?, ?, ?)")
      .run(id, req.session.user.id, '[]');
    res.redirect(`/doodle/${id}`);
});

app.get('/doodle/:id', protect, (req, res) => {
    const row = db.prepare("SELECT * FROM doodles WHERE id = ?").get(req.params.id);
    if(!row) return res.redirect('/doodles');
    
    res.render('livedoodles', { 
        user: req.session.user, 
        roomId: row.id, 
        roomName: 'Doodle Session' 
    });
});

app.post('/doodle/delete', protect, (req, res) => {
    const { doodleId } = req.body;
    const row = db.prepare("SELECT * FROM doodles WHERE id = ?").get(doodleId);
    if (row && (row.creatorId === req.session.user.id || req.session.user.role === 'admin')) {
        db.prepare("DELETE FROM doodles WHERE id = ?").run(doodleId);
    }
    res.redirect('/doodles');
});

// ============================================================
// 8. ADMIN ROUTE
// ============================================================
app.get('/admin', protect, adminOnly, (req, res) => {
    const usersRaw = db.prepare("SELECT * FROM users").all();
    const users = usersRaw.map(r => ({ ...r, ...JSON.parse(r.data) }));
    
    const roles = getRoles();
    const settings = { maintenance: getMaintenance() };
    
    res.render('admin', { users, roles, settings });
});

app.post('/admin/create-user', protect, adminOnly, (req, res) => {
    const u = {
        id: uuidv4(), username: req.body.username, email: req.body.email,
        password: bcrypt.hashSync(req.body.password, 10),
        role: req.body.role, banned: false,
        profilePic: `https://ui-avatars.com/api/?name=${req.body.username}`,
        moots: { text: "Admin Created", color: "#888" }, friends:[], friendRequests:[], blocked:[], createdAt: new Date()
    };
    createUser(u);
    res.redirect('/admin');
});

app.post('/admin/delete-user', protect, adminOnly, (req, res) => {
    const targetId = req.body.userId;
    db.prepare("DELETE FROM users WHERE id = ?").run(targetId);
    // Note: Cleanup from friends/rooms is complex in SQL, skipped for brevity but recommended for prod
    res.redirect('/admin');
});

app.post('/admin/ban-user', protect, adminOnly, (req, res) => {
    const u = getUser(req.body.userId);
    if(u && u.role !== 'admin') {
        u.banned = !u.banned;
        saveUser(u);
        if(u.banned) io.to(`user_${u.id}`).emit('force_logout');
    }
    res.redirect('/admin');
});

// --- REPLACE EXISTING /admin/update-user ---
app.post('/admin/update-user', protect, adminOnly, (req, res) => {
    const u = getUser(req.body.userId);
    if(u) {
        u.role = req.body.role;
        
        // LOGIKA TIME LIMIT (YANG HILANG)
        const val = parseInt(req.body.timeValue);
        const unit = req.body.timeUnit;
        
        if (val && val > 0 && unit !== 'permanent') {
            let mult = 0;
            if (unit === 'seconds') mult = 1000;
            else if (unit === 'minutes') mult = 60000;
            else if (unit === 'hours') mult = 3600000;
            else if (unit === 'days') mult = 86400000;
            
            // Disimpan ke JSON 'data' via saveUser karena tidak ada kolom roleExpiresAt
            u.roleExpiresAt = Date.now() + (val * mult); 
        } else {
            u.roleExpiresAt = null;
        }
        
        saveUser(u);
    }
    res.redirect('/admin');
});

// --- ROUTE BARU: ADMIN BROADCAST ---
app.post('/admin/broadcast', protect, adminOnly, (req, res) => {
    const msg = req.body.message;
    io.emit('new_notification', { title: '討 PENGUMUMAN ADMIN', body: msg });
    res.redirect('/admin');
});

app.post('/admin/create-role', protect, adminOnly, (req, res) => {
    db.prepare("INSERT INTO roles (id, name, color, canRgb, canGif) VALUES (?,?,?,?,?)")
      .run(uuidv4(), req.body.roleName, req.body.roleColor, req.body.canRgb === 'on' ? 1 : 0, req.body.canGif === 'on' ? 1 : 0);
    res.redirect('/admin');
});
app.post('/admin/delete-role', protect, adminOnly, (req, res) => {
    db.prepare("DELETE FROM roles WHERE id=?").run(req.body.roleId);
    res.redirect('/admin');
});
app.post('/admin/toggle-maintenance', protect, adminOnly, (req, res) => {
    const cur = getMaintenance();
    setMaintenance(!cur);
    if(!cur) io.emit('server_maintenance');
    res.redirect('/admin');
});

// ============================================================
// 9. CHAT SYSTEM ROUTES
// ============================================================

app.get('/chat', protect, (req, res) => {
    const myId = req.session.user.id;
    const allRooms = db.prepare("SELECT * FROM rooms").all();
    
    // Filter rooms where I am a member (Manual Filter via JSON parsing)
    const myRooms = [];
    allRooms.forEach(raw => {
        const members = JSON.parse(raw.members);
        const settings = JSON.parse(raw.settings);
        const messages = JSON.parse(raw.messages);
        
        if (members.some(m => m.userId === myId)) {
            let name = settings.name;
            let icon = settings.icon;
            let online = false;

            if (raw.type === 'private') {
                const other = members.find(m => m.userId !== myId);
                const otherUser = getUser(other.userId);
                name = otherUser ? otherUser.username : 'Unknown';
                icon = otherUser ? otherUser.profilePic : '';
                online = onlineUsers.has(other.userId);
            }

            const last = messages[messages.length - 1];
            myRooms.push({
                id: raw.id, type: raw.type, name, icon, online,
                lastMsg: last ? last.content : 'Mulai chat'
            });
        }
    });

    const u = getUser(myId);
    // Load contact list (friends)
    let contacts = [];
    if(u.friends.length > 0) {
        const ph = u.friends.map(()=>'?').join(',');
        const rows = db.prepare(`SELECT * FROM users WHERE id IN (${ph})`).all(...u.friends);
        contacts = rows.map(r => ({...r, ...JSON.parse(r.data)}));
    }

    res.render('chat_list', { user: u, rooms: myRooms, contacts, publicKey: publicVapidKey });
});

app.post('/chat/create-private', protect, (req, res) => {
    const myId = req.session.user.id;
    const targetId = req.body.targetId;
    const me = getUser(myId);
    const target = getUser(targetId);

    if(!me.friends.includes(targetId)) return res.send('<script>alert("Belum berteman!");window.location="/dashboard"</script>');
    if(target.blocked.includes(myId)) return res.send('<script>alert("Diblokir!");window.location="/dashboard"</script>');

    // Cek duplikat room
    // Logic: Ambil semua room private, cek membernya
    const allPrivates = db.prepare("SELECT * FROM rooms WHERE type='private'").all();
    const exist = allPrivates.find(r => {
        const mems = JSON.parse(r.members);
        return mems.some(m => m.userId === myId) && mems.some(m => m.userId === targetId);
    });

    if(exist) return res.redirect(`/chat/${exist.id}`);

    const nr = {
        id: uuidv4(), type: 'private',
        members: [{userId: myId, role:'admin'}, {userId: targetId, role:'admin'}],
        messages: [], settings: { expiresIn: 0 }
    };
    createRoom(nr);
    res.redirect(`/chat/${nr.id}`);
});


// --- STANDALONE UPDATE USERNAME (Kompatibilitas Frontend) ---
app.post('/update-username', protect, (req, res) => {
    // Ambil data user terbaru dari DB
    const u = getUser(req.session.user.id);
    const newName = req.body.newUsername || req.body.username; 

    if (u && newName) {
        // Cek apakah username sudah dipakai orang lain (SQLite Version)
        // Query: Pilih ID dari users dimana username = newName DAN id BUKAN id saya
        const exist = db.prepare("SELECT id FROM users WHERE username = ? AND id != ?").get(newName, u.id);

        if (exist) {
            return res.send('<script>alert("Username sudah digunakan!"); window.location.href="/dashboard";</script>');
        }
        
        // Update Username
        u.username = newName;
        
        // Update Avatar jika masih menggunakan default UI Avatars
        if (u.profilePic && u.profilePic.includes('ui-avatars.com')) {
            u.profilePic = `https://ui-avatars.com/api/?name=${newName}`;
        }
        
        // Simpan perubahan ke Database SQLite
        saveUser(u);
        
        // Update Session agar perubahan langsung terasa tanpa relogin
        req.session.user = u;
        req.session.save((err) => {
            if(err) console.log(err);
            res.redirect('/dashboard');
        });
    } else {
        res.redirect('/dashboard');
    }
});




// --- ROUTE BARU: UPDATE GROUP ICON ---
app.post('/chat/update-group-icon', protect, upload.single('groupIcon'), (req, res) => {
    const row = db.prepare("SELECT * FROM rooms WHERE id = ?").get(req.body.roomId);
    if(row && req.file) {
        const settings = JSON.parse(row.settings || '{}');
        settings.icon = `/uploads/${req.file.filename}`; // Update path icon di settings
        
        db.prepare("UPDATE rooms SET settings = ? WHERE id = ?")
          .run(JSON.stringify(settings), req.body.roomId);
          
        res.json({success: true});
    } else {
        res.json({success: false});
    }
});


app.get('/join-group/:code', protect, (req, res) => {
    // SQLite agak sulit filter JSON langsung tanpa extension, jadi kita fetch manual
    // Catatan: Untuk produksi, gunakan json_extract di query SQL jika SQLite version mendukung
    const allGroups = db.prepare("SELECT * FROM rooms WHERE type='group'").all();
    
    const roomRaw = allGroups.find(r => {
        const s = JSON.parse(r.settings || '{}');
        return s.inviteCode === req.params.code;
    });
    
    if(!roomRaw) return res.send(`<h1 style="text-align:center;">Link Invalid</h1><center><a href="/dashboard">Back</a></center>`);
    
    const myId = req.session.user.id;
    const members = JSON.parse(roomRaw.members || '[]');
    
    // 1. Cek Blokir oleh Admin Grup
    const adminMember = members.find(m => m.role === 'admin');
    if (adminMember) {
        const adminUser = getUser(adminMember.userId);
        if (adminUser && adminUser.blocked.includes(myId)) {
            return res.send('<h2 style="color:red; text-align:center;">Anda diblokir oleh Admin grup ini.</h2>');
        }
    }

    // 2. Proses Join
    const isMember = members.find(m => m.userId === myId);
    if(!isMember) {
        members.push({ userId: myId, role: 'member' });
        
        db.prepare("UPDATE rooms SET members = ? WHERE id = ?")
          .run(JSON.stringify(members), roomRaw.id);
          
        const u = getUser(myId);
        createSystemMessage(roomRaw.id, `${u.username} bergabung melalui tautan`);
    }
    
    res.redirect(`/chat/${roomRaw.id}`);
});


app.post('/chat/create-group', protect, upload.single('groupIcon'), (req, res) => {
    const nr = {
        id: uuidv4(), type: 'group',
        name: req.body.groupName,
        icon: req.file ? `/uploads/${req.file.filename}` : '',
        members: [{userId: req.session.user.id, role: 'admin'}],
        messages: [],
        inviteCode: uuidv4().slice(0, 8),
        settings: { locked: false, expiresIn: 0 }
    };
    // Initial msg
    nr.messages.push({
        id: uuidv4(), type: 'system', content: `Grup ${nr.name} dibuat`,
        timestamp: Date.now(), time: 'Now', readBy: []
    });
    createRoom(nr);
    res.redirect(`/chat/${nr.id}`);
});

app.get('/chat/:roomId', protect, (req, res) => {
    const r = getRoom(req.params.roomId);
    if(!r) return res.redirect('/chat');
    
    // Hydrate members
    const mems = r.members.map(m => {
        const u = getUser(m.userId);
        return { 
            ...m, 
            username: u?.username, 
            pic: u?.profilePic, 
            isOnline: onlineUsers.has(m.userId),
            moots: u?.moots
        };
    });

    // Pinned Msg
    let pinnedMsg = null;
    if(r.pinnedMessageId) pinnedMsg = r.messages.find(m => m.id === r.pinnedMessageId);

    // Context Display
    let rName = r.name; 
    let rIcon = r.icon;
    let target = null;
    if(r.type === 'private') {
        const o = mems.find(m => m.userId !== req.session.user.id);
        rName = o?.username || 'Unknown';
        rIcon = o?.pic;
        target = o;
    }

    const me = getUser(req.session.user.id);
    let contacts = [];
    if(me.friends.length > 0) {
        const ph = me.friends.map(()=>'?').join(',');
        const rows = db.prepare(`SELECT * FROM users WHERE id IN (${ph})`).all(...me.friends);
        contacts = rows.map(row => ({...row, ...JSON.parse(row.data)}));
    }

    const myRole = r.members.find(m=>m.userId === me.id)?.role || 'member';

    res.render('chat_room', {
        user: me, room: r, roomName: rName, roomIcon: rIcon,
        members: mems, myRole, targetUser: target, 
        publicKey: publicVapidKey, pinnedMessage: pinnedMsg, contacts
    });
});

app.post('/chat/upload', protect, upload.single('file'), (req, res) => {
    if(!req.file) return res.json({success: false});
    let type = 'file';
    if(req.file.mimetype.startsWith('image')) type='image';
    else if(req.file.mimetype.startsWith('video')) type='video';
    else if(req.file.mimetype.startsWith('audio')) type='audio';
    res.json({success:true, filePath: `/uploads/${req.file.filename}`, fileName: req.file.originalname, type});
});

// ============================================================
// 10. SOCKET.IO LOGIC (SQLITE ADAPTED)
// ============================================================

io.on('connection', (socket) => {
    const uid = socket.handshake.query.userId;
    if(uid) {
        socket.join(`user_${uid}`);
        onlineUsers.add(uid);
        socket.broadcast.emit('user_status', { userId: uid, status: 'online' });
    }

    socket.on('join_room', ({roomId}) => socket.join(roomId));

    // --- CHAT MESSAGE ---
    socket.on('send_message', ({roomId, userId, type, content, fileName, replyTo}) => {
        const r = getRoom(roomId);
        if(!r) return;
        
        // Settings & Block Checks
        if(r.settings.locked) {
            const m = r.members.find(x => x.userId === userId);
            if(!m || (m.role !== 'admin' && m.role !== 'moderator')) return;
        }

        if(r.type === 'private') {
            const otherId = r.members.find(m => m.userId !== userId).userId;
            const other = getUser(otherId);
            const me = getUser(userId);
            
            if(other.blocked.includes(userId)) {
                socket.emit('receive_message', {id: 'sys', type:'system', content: 'Anda diblokir', timestamp: Date.now()});
                return;
            }
        }

        const u = getUser(userId);
        const msg = {
            id: uuidv4(), userId, username: u.username, pic: u.profilePic,
            type, content, fileName, replyTo,
            timestamp: Date.now(), time: new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}),
            reactions: {}, readBy: [userId], edited: false, deleted: false
        };

        r.messages.push(msg);
        saveRoom(r);
        io.to(roomId).emit('receive_message', msg);
    });

    // --- FRIEND SYSTEM ---
    socket.on('search_user', ({query, userId}) => {
        const me = getUser(userId);
        // SQL Search LIKE
        const rows = db.prepare("SELECT * FROM users WHERE username LIKE ? AND id != ?").all(`%${query}%`, userId);
        
        const results = rows.map(row => {
            const u = { ...row, ...JSON.parse(row.data) };
            if(me.friends.includes(u.id)) return null;
            return {
                id: u.id, username: u.username, pic: u.profilePic,
                status: me.friendRequests.includes(u.id) ? 'pending' : 'add'
            };
        }).filter(x => x);
        
        socket.emit('search_result', results);
    });

    socket.on('friend_action', ({ action, targetId, userId }) => {
        const me = getUser(userId);
        const target = getUser(targetId);
        
        if(!me || !target) return;
        
        if(action === 'add') {
            if(!target.friendRequests.includes(userId) && !target.friends.includes(userId)) {
                target.friendRequests.push(userId);
                saveUser(target);
                io.to(`user_${targetId}`).emit('new_notification', {title: 'Friend Request', body: `${me.username} ingin berteman`});
                socket.emit('friend_msg', 'Request sent!');
            }
        } else if (action === 'accept') {
            if(me.friendRequests.includes(targetId)) {
                me.friendRequests = me.friendRequests.filter(x => x !== targetId);
                me.friends.push(targetId);
                target.friends.push(userId);
                saveUser(me); saveUser(target);
                socket.emit('refresh_dashboard');
                io.to(`user_${targetId}`).emit('refresh_dashboard');
            }
        } else if (action === 'reject') {
            me.friendRequests = me.friendRequests.filter(x => x !== targetId);
            saveUser(me);
            socket.emit('refresh_dashboard');
        }
    });

    // --- MUSIC ROOM ---
    socket.on('join_music_room', (roomId) => {
        socket.join(`music_${roomId}`);
        socket.musicRoomId = roomId;

        if (!musicRoomUsers[roomId]) musicRoomUsers[roomId] = [];
        const u = getUser(uid);
        if(u && !musicRoomUsers[roomId].find(x => x.id === u.id)) {
            musicRoomUsers[roomId].push({id: u.id, username: u.username, pic: u.profilePic});
        }
        io.to(`music_${roomId}`).emit('update_music_members', musicRoomUsers[roomId]);
    });

    socket.on('music_control', ({ roomId, action, data }) => {
        io.to(`music_${roomId}`).emit('music_action', { action, data });
        // Optional: Update DB state if you want persistent state (not strictly needed for realtime control)
    });
    
    socket.on('send_music_chat', ({ roomId, message, userId }) => {
        const row = db.prepare("SELECT * FROM music_sessions WHERE id = ?").get(roomId);
        if(row) {
            const chat = JSON.parse(row.chat || '[]');
            const u = getUser(userId);
            const msg = {
                id: uuidv4(), username: u.username, pic: u.profilePic, text: message,
                time: new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})
            };
            chat.push(msg);
            if(chat.length > 50) chat.shift();
            
            db.prepare("UPDATE music_sessions SET chat = ? WHERE id = ?").run(JSON.stringify(chat), roomId);
            io.to(`music_${roomId}`).emit('receive_music_chat', msg);
        }
    });

    // --- DOODLE ---
    socket.on('join_doodle_room', (roomId) => {
        socket.join(`doodle_${roomId}`);
        const row = db.prepare("SELECT * FROM doodles WHERE id = ?").get(roomId);
        if(row) {
            socket.emit('load_history', JSON.parse(row.lines || '[]'));
        }
    });
    
    socket.on('doodle_draw', ({ roomId, line }) => {
        const row = db.prepare("SELECT * FROM doodles WHERE id = ?").get(roomId);
        if(row) {
            const lines = JSON.parse(row.lines || '[]');
            lines.push(line);
            db.prepare("UPDATE doodles SET lines = ? WHERE id = ?").run(JSON.stringify(lines), roomId);
            socket.to(`doodle_${roomId}`).emit('doodle_draw', line);
        }
    });

    socket.on('doodle_clear', (roomId) => {
        db.prepare("UPDATE doodles SET lines = ? WHERE id = ?").run('[]', roomId);
        socket.to(`doodle_${roomId}`).emit('doodle_clear');
    });

    socket.on('disconnect', () => {
        if(uid) {
            onlineUsers.delete(uid);
            socket.broadcast.emit('user_status', { userId: uid, status: 'offline' });
            if(socket.musicRoomId && musicRoomUsers[socket.musicRoomId]) {
                musicRoomUsers[socket.musicRoomId] = musicRoomUsers[socket.musicRoomId].filter(u => u.id !== uid);
                io.to(`music_${socket.musicRoomId}`).emit('update_music_members', musicRoomUsers[socket.musicRoomId]);
            }
        }
    });
});

http.listen(PORT, () => console.log(` GenZChat Server running on port ${PORT}`));
