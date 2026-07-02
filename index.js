const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const cron = require('node-cron');
const axios = require('axios');
const path = require('path');

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '30mb' }));

const fs = require('fs');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('./db');
const multer = require('multer');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

// initialize Postgres DB if configured; otherwise fall back to JSON store
db.init().then(()=>console.info('DB initialized')).catch(()=>console.info('DB not initialized; using JSON fallback'));

// ensure directories
const storiesDir = path.join(__dirname, 'public', 'stories');
if (!fs.existsSync(storiesDir)) fs.mkdirSync(storiesDir, { recursive: true });
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// ensure uploads directories
const reelsDir = path.join(__dirname, 'public', 'uploads', 'reels');
const postsDir = path.join(__dirname, 'public', 'uploads', 'posts');
if (!fs.existsSync(reelsDir)) fs.mkdirSync(reelsDir, { recursive: true });
if (!fs.existsSync(postsDir)) fs.mkdirSync(postsDir, { recursive: true });

// ensure downloads directory for OTA / desktop assets
const downloadsDir = path.join(__dirname, 'public', 'downloads');
if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });
// Serve downloadable artifacts from /downloads/*
app.use('/downloads', express.static(downloadsDir, { maxAge: '1d' }));

// Simple request logger for structured logs (production-friendly)
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const entry = {
      ts: new Date().toISOString(),
      method: req.method,
      path: req.originalUrl || req.url,
      status: res.statusCode,
      duration_ms: duration,
      ip: req.ip || req.connection.remoteAddress
    };
    console.info('req', JSON.stringify(entry));
  });
  next();
});

const REELS_FILE = path.join(dataDir, 'reels.json');
const POSTS_FILE = path.join(dataDir, 'posts.json');
const ENGAGEMENTS_FILE = path.join(dataDir, 'engagements.json');

// multer setup
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    if (file.fieldname === 'video') cb(null, reelsDir);
    else if (file.fieldname === 'image') cb(null, postsDir);
    else cb(null, reelsDir);
  },
  filename: function (req, file, cb) {
    const id = require('crypto').randomUUID();
    const ext = path.extname(file.originalname) || (file.mimetype === 'video/mp4' ? '.mp4' : '.jpg');
    cb(null, id + ext);
  }
});
const upload = multer({ storage: storage });

// simple JSON-backed stores for stories and likes (fallback)
const STORIES_FILE = path.join(dataDir, 'stories.json');
const LIKES_FILE = path.join(dataDir, 'likes.json');
const USERS_FILE = path.join(dataDir, 'users.json');

async function findUserByEmail(email){
  if (process.env.DATABASE_URL) return await db.findUserByEmail(email);
  const arr = loadJsonSafe(USERS_FILE); return arr.find(u=>u.email===email);
}

async function findUserById(id){
  if (process.env.DATABASE_URL) return await db.findUserById(id);
  const arr = loadJsonSafe(USERS_FILE); return arr.find(u=>u.id===id);
}

async function addUser(rec){
  if (process.env.DATABASE_URL) return await db.addUser(rec);
  const arr = loadJsonSafe(USERS_FILE); arr.push(rec); saveJsonSafe(USERS_FILE, arr); return rec;
}

function loadJsonSafe(filePath){
  try { if (!fs.existsSync(filePath)) return []; const raw = fs.readFileSync(filePath,'utf8'); return JSON.parse(raw || '[]'); } catch (e) { return []; }
}
function saveJsonSafe(filePath, obj){ fs.writeFileSync(filePath, JSON.stringify(obj, null, 2)); }

async function addStoryRecord(rec){ if (process.env.DATABASE_URL) return await db.addStory(rec); const arr = loadJsonSafe(STORIES_FILE); arr.push(rec); saveJsonSafe(STORIES_FILE, arr); }
async function getRecentStories(){ if (process.env.DATABASE_URL) return await db.getRecentStories(); const arr = loadJsonSafe(STORIES_FILE); const cutoff = Date.now() - 24*60*60*1000; return arr.filter(r=>r.created_at>cutoff).sort((a,b)=>b.created_at-a.created_at); }
async function purgeOldStories(){ if (process.env.DATABASE_URL) return await db.purgeOldStories(); const arr = loadJsonSafe(STORIES_FILE); const cutoff = Date.now() - 24*60*60*1000; const kept = arr.filter(r=>r.created_at>cutoff); saveJsonSafe(STORIES_FILE, kept); }

async function addLikeRecord(rec){ if (process.env.DATABASE_URL) return await db.addLike(rec); const arr = loadJsonSafe(LIKES_FILE); arr.push(rec); saveJsonSafe(LIKES_FILE, arr); }
async function hasLike(from, to){ if (process.env.DATABASE_URL) return await db.hasLike(from,to); const arr = loadJsonSafe(LIKES_FILE); return arr.find(l=>l.from_user===from && l.to_user===to); }
async function purgeOldLikes(){ if (process.env.DATABASE_URL) return await db.purgeOldLikes(); const arr = loadJsonSafe(LIKES_FILE); const cutoff = Date.now() - 24*60*60*1000; const kept = arr.filter(r=>r.created_at>cutoff); saveJsonSafe(LIKES_FILE, kept); }

async function findUserByPhone(phone){
  if (process.env.DATABASE_URL) return await db.findUserByPhone(phone);
  const arr = loadJsonSafe(USERS_FILE); return arr.find(u=>u.phone===phone);
}

async function addReelRecord(rec){ if (process.env.DATABASE_URL) return await db.addReel(rec); const arr = loadJsonSafe(REELS_FILE); arr.push(rec); saveJsonSafe(REELS_FILE, arr); }
async function getReels(){ if (process.env.DATABASE_URL) return await db.getReels(); const arr = loadJsonSafe(REELS_FILE); return arr.sort((a,b)=>b.created_at-a.created_at); }
async function addPostRecord(rec){ if (process.env.DATABASE_URL) return await db.addPost(rec); const arr = loadJsonSafe(POSTS_FILE); arr.push(rec); saveJsonSafe(POSTS_FILE, arr); }
async function getPosts(){ if (process.env.DATABASE_URL) return await db.getPosts(); const arr = loadJsonSafe(POSTS_FILE); return arr.sort((a,b)=>b.created_at-a.created_at); }
async function addEngagementRecord(ev){ if (process.env.DATABASE_URL) return await db.addEngagement(ev); const arr = loadJsonSafe(ENGAGEMENTS_FILE); arr.push(ev); saveJsonSafe(ENGAGEMENTS_FILE, arr); }
async function getEngagementsForTarget(target_type, target_id){ if (process.env.DATABASE_URL) return await db.getEngagementsForTarget(target_type, target_id); const arr = loadJsonSafe(ENGAGEMENTS_FILE); return arr.filter(e=>e.target_type===target_type && e.target_id===target_id).sort((a,b)=>b.created_at-a.created_at); }

app.get('/', (_req, res) => {
  res.type('text').send('Server is running');
});

// Health check and monitor endpoints for automated probes
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime_sec: process.uptime(), ts: Date.now() });
});

app.get('/monitor', (_req, res) => {
  const mem = process.memoryUsage();
  res.json({
    status: 'ok',
    pid: process.pid,
    uptime_sec: process.uptime(),
    mem,
    loadavg: (typeof os !== 'undefined' && os.loadavg) ? require('os').loadavg() : [],
    ts: Date.now()
  });
});

// Simple API endpoints for dashboard data
app.get('/api/profiles', (_req, res) => {
  const profiles = [
    {
      id: 'mia',
      name: 'Mia',
      age: 27,
      match: 94,
      interests: ['Music', 'Travel', 'Art'],
      photo: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=1200&q=80',
      bio: 'Creative strategist. Late-night conversation lover.'
    },
    {
      id: 'leo',
      name: 'Leo',
      age: 30,
      match: 91,
      interests: ['Hiking', 'Cooking'],
      photo: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=1200&q=80',
      bio: 'Weekend hiker and creative projects enthusiast.'
    },
    {
      id: 'aria',
      name: 'Aria',
      age: 24,
      match: 96,
      interests: ['Music', 'City life'],
      photo: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=1200&q=80',
      bio: 'Music lover and city explorer.'
    },
    {
      id: 'jude',
      name: 'Jude',
      age: 28,
      match: 89,
      interests: ['Cooking', 'Outdoors'],
      photo: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=1200&q=80',
      bio: 'Chef at heart and outdoor enthusiast.'
    }
  ];

  res.json(profiles);
});

// Enhanced profiles endpoint with engagement-scoring/ranking
app.get('/api/profiles', async (_req, res) => {
  try {
    // base profiles (could be from DB); for now reuse static list
    const baseProfiles = [
      {
        id: 'mia',
        name: 'Mia',
        age: 27,
        match: 94,
        interests: ['Music', 'Travel', 'Art'],
        photo: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=1200&q=80',
        bio: 'Creative strategist. Late-night conversation lover.'
      },
      {
        id: 'leo',
        name: 'Leo',
        age: 30,
        match: 91,
        interests: ['Hiking', 'Cooking'],
        photo: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=1200&q=80',
        bio: 'Weekend hiker and creative projects enthusiast.'
      },
      {
        id: 'aria',
        name: 'Aria',
        age: 24,
        match: 96,
        interests: ['Music', 'City life'],
        photo: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=1200&q=80',
        bio: 'Music lover and city explorer.'
      },
      {
        id: 'jude',
        name: 'Jude',
        age: 28,
        match: 89,
        interests: ['Cooking', 'Outdoors'],
        photo: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=1200&q=80',
        bio: 'Chef at heart and outdoor enthusiast.'
      }
    ];

    // compute score for each profile
    const scored = await Promise.all(baseProfiles.map(async (p) => {
      // retention: average view duration (ms) from engagements
      const engagements = await getEngagementsForTarget('profile', p.id);
      const viewEvents = engagements.filter(e => e.event_type === 'view' && e.duration_ms);
      const avgDuration = viewEvents.length? Math.round(viewEvents.reduce((s,ev)=>s+ (ev.duration_ms||0),0)/viewEvents.length) : 0;
      // normalize avgDuration to 0-1 over a 30s window
      const normRetention = Math.min(1, avgDuration / 30000);
      // proximity: mock (closer = higher). We'll random small distances for demo
      const distKm = (Math.abs(p.name.charCodeAt(0) - 77) % 50) / 10; // pseudo distance
      const proximityScore = Math.max(0, 1 - Math.min(1, distKm/10));
      // base match normalized
      const baseMatch = (p.match || 50) / 100;
      // dopamine refresh factor: favor recent high-frequency interactions
      const recentCount = engagements.filter(e=>Date.now()-e.created_at < 1000*60*60*24).length;
      const recencyBoost = Math.min(1, recentCount / 10);

      const score = Math.round((baseMatch * 0.5 + normRetention * 0.3 + proximityScore * 0.15 + recencyBoost * 0.05) * 100);
      return Object.assign({}, p, { score, avg_view_ms: avgDuration });
    }));

    // sort by score desc
    scored.sort((a,b)=>b.score - a.score);
    res.json(scored);
  } catch (err) {
    console.error('profiles scoring error', err.message);
    res.status(500).json([]);
  }
});

// Online locations: return recent locations from DB or in-memory store
const liveLocations = new Map();

app.get('/api/online', async (_req, res) => {
  try {
    if (process.env.DATABASE_URL) {
      const rows = await db.getOnlineLocations(1000*60*60); // last hour
      return res.json(rows.map(r=>({ id: r.id, user_id: r.user_id, lat: r.lat, lng: r.lng, last_seen: r.last_seen })));
    }
    // fallback to in-memory map
    const out = [];
    for (const [k, v] of liveLocations.entries()) out.push(v);
    return res.json(out);
  } catch (e) {
    console.warn('api/online error', e.message);
    return res.json([]);
  }
});

// HTTP fallback for location updates (clients that can't use WebSockets)
app.post('/api/location', async (req, res) => {
  try {
    const body = req.body || {};
    // allow token via Authorization header or body.token
    const payload = authFromHeader(req) || (body.token ? (function(){ try { return jwt.verify(body.token, JWT_SECRET); } catch(e){ return null; } })() : null);
    const userId = payload ? (payload.sub || payload.user_id || null) : null;

    if (typeof body.lat === 'undefined' || typeof body.lng === 'undefined') return res.status(400).json({ error: 'lat and lng required' });
    const lat = parseFloat(body.lat);
    const lng = parseFloat(body.lng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return res.status(400).json({ error: 'invalid lat/lng' });

    const accuracy = (typeof body.accuracy !== 'undefined') ? parseFloat(body.accuracy) : null;
    const id = body.id || userId || require('crypto').randomUUID();
    const now = Date.now();
    const record = { id, user_id: userId, lat, lng, accuracy, last_seen: now, name: (payload && payload.name) || null };

    // update in-memory cache
    liveLocations.set(id, record);

    // persist to DB if configured
    if (process.env.DATABASE_URL) {
      try {
        await db.upsertLocation({ id, user_id: userId, lat, lng, accuracy, last_seen: now });
      } catch (e) {
        console.warn('upsertLocation failed (http)', e.message);
      }
    }

    // broadcast to connected clients
    try { io.emit('user:location', { id, lat, lng, name: record.name, ts: now }); } catch (e) { /* ignore */ }

    return res.json({ success: true, id, ts: now });
  } catch (e) {
    console.warn('POST /api/location error', e && e.message);
    return res.status(500).json({ error: 'server error' });
  }
});

// Auth endpoints
// Phone + password signup/login
app.post('/api/signup', async (req, res) => {
  const { phone, name, password } = req.body || {};
  if (!phone || !password) return res.status(400).json({ error: 'phone and password required' });
  const existing = await findUserByPhone(phone);
  if (existing) return res.status(400).json({ error: 'user exists' });
  const id = require('crypto').randomUUID();
  const hashed = bcrypt.hashSync(password, 10);
  const user = { id, phone, email: null, name: name||('user_'+phone.replace(/\D/g,'')), password: hashed, created_at: Date.now() };
  await addUser(user);
  const token = jwt.sign({ sub: id, phone: user.phone }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id: user.id, phone: user.phone, name: user.name } });
});

app.post('/api/login', async (req, res) => {
  const { phone, password } = req.body || {};
  if (!phone || !password) return res.status(400).json({ error: 'phone and password required' });
  const user = await findUserByPhone(phone);
  if (!user || !user.password) return res.status(401).json({ error: 'invalid' });
  if (!bcrypt.compareSync(password, user.password)) return res.status(401).json({ error: 'invalid' });
  const token = jwt.sign({ sub: user.id, phone: user.phone }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id: user.id, phone: user.phone, name: user.name } });
});

function authFromHeader(req){ const auth = req.headers.authorization || ''; if (!auth) return null; const m = auth.match(/^Bearer (.+)$/); if(!m) return null; try{ const payload = jwt.verify(m[1], JWT_SECRET); return payload; }catch(e){ return null; } }

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// Simple in-memory rate limiting for location endpoints (HTTP + Socket)
const RATE_LIMITS = {
  http: { windowMs: 60 * 1000, max: 60, maxContentLength: 16 * 1024 }, // 60 requests/min, 16KB payload
  socket: { windowMs: 10 * 1000, max: 10 }, // 10 updates per 10s
};
const _rateMap = new Map();
const _socketRateMap = new Map();

function _keyForReq(req) {
  const auth = authFromHeader(req);
  if (auth && auth.sub) return `u:${auth.sub}`;
  return `ip:${(req.headers['x-forwarded-for'] || req.ip || req.connection && req.connection.remoteAddress || 'anon')}`;
}

function locationRateLimitMiddleware(req, res, next) {
  try {
    const key = _keyForReq(req);
    const now = Date.now();
    const st = _rateMap.get(key) || { count: 0, first: now };
    if (now - st.first > RATE_LIMITS.http.windowMs) { st.count = 0; st.first = now; }
    st.count++;
    _rateMap.set(key, st);
    if (st.count > RATE_LIMITS.http.max) return res.status(429).json({ error: 'rate_limited' });
    const len = parseInt(req.get('content-length') || '0', 10) || 0;
    if (len && len > RATE_LIMITS.http.maxContentLength) return res.status(413).json({ error: 'payload_too_large' });
    return next();
  } catch (e) {
    return next();
  }
}

// Socket.IO: accept location updates from clients, persist to DB, and broadcast to others
io.on('connection', (socket) => {
  // try to extract JWT from handshake auth or query
  let token = null;
  try {
    token = (socket.handshake && socket.handshake.auth && socket.handshake.auth.token) || (socket.handshake && socket.handshake.query && socket.handshake.query.token) || null;
  } catch (e) { token = null; }
  let socketUser = null;
  if (token) {
    try { socketUser = jwt.verify(token, JWT_SECRET); } catch (e) { socketUser = null; }
  }

  socket.on('location:update', async (payload) => {
    try {
      // socket-level rate limiting: per-socket short window
      const now = Date.now();
      const sr = _socketRateMap.get(socket.id) || { count: 0, first: now };
      if (now - sr.first > RATE_LIMITS.socket.windowMs) { sr.count = 0; sr.first = now; }
      sr.count++;
      _socketRateMap.set(socket.id, sr);
      if (sr.count > RATE_LIMITS.socket.max) {
        try { socket.emit('rate_limited', { reason: 'throttled' }); } catch (e) {}
        return;
      }

      if (!payload || typeof payload.lat === 'undefined' || typeof payload.lng === 'undefined') return;
      const lat = parseFloat(payload.lat);
      const lng = parseFloat(payload.lng);
      const accuracy = typeof payload.accuracy !== 'undefined' ? parseFloat(payload.accuracy) : null;
      const id = payload.id || (socketUser && socketUser.sub) || socket.id;
      const record = { id, user_id: socketUser && socketUser.sub, lat, lng, accuracy, last_seen: now, name: (socketUser && socketUser.name) || null };
      // update in-memory cache
      liveLocations.set(id, record);
      // persist to DB if available
      if (process.env.DATABASE_URL) {
        try { await db.upsertLocation({ id, user_id: socketUser && socketUser.sub, lat, lng, accuracy, last_seen: now }); } catch (e) { console.warn('upsertLocation failed', e.message); }
      }
      // broadcast to other clients
      socket.broadcast.emit('user:location', { id, lat, lng, name: record.name, ts: now });
    } catch (e) {
      console.warn('location:update handler error', e && e.message);
    }
  });

  socket.on('disconnect', () => {
    try { liveLocations.delete(socket.id); } catch (e) {}
  });
});

let waitingUsers = [];
const activeRooms = new Map();

function removeWaitingUser(socketId) {
  waitingUsers = waitingUsers.filter((user) => user.socket.id !== socketId);
}

function cleanupRoom(roomID) {
  const room = activeRooms.get(roomID);
  if (!room) {
    return;
  }

  room.participants.forEach(({ socket }) => {
    try {
      socket.leave(roomID);
    } catch (error) {
      console.warn('Unable to leave room cleanly:', error);
    }
  });

  activeRooms.delete(roomID);
}

function requeueRemainingParticipant(room, excludedSocketId) {
  const remainingParticipant = room.participants.find(({ socket }) => socket.id !== excludedSocketId);
  if (!remainingParticipant) {
    return;
  }

  waitingUsers.push({
    socket: remainingParticipant.socket,
    name: remainingParticipant.user.name,
    gender: remainingParticipant.user.gender,
    preference: remainingParticipant.user.preference,
    profileImageBase64: remainingParticipant.user.profileImageBase64 || null,
  });
}

io.on('connection', (socket) => {
  console.log('User Connected:', socket.id);
  // map of connected userId -> socket
  // when a client identifies itself with a userId, we'll store it here
  socket.userId = null;

  socket.on('find_match', (userData = {}) => {
    removeWaitingUser(socket.id);

    if (waitingUsers.length > 0) {
      const partner = waitingUsers.shift();
      const roomID = 'room_' + Math.random().toString(36).substring(2, 10);
      const room = {
        roomID,
        participants: [
          {
            socket,
            user: {
              name: userData.name || 'Guest',
              gender: userData.gender,
              preference: userData.preference,
              profileImageBase64: userData.profileImageBase64 || null,
            },
          },
          {
            socket: partner.socket,
            user: {
              name: partner.name || 'Guest',
              gender: partner.gender,
              preference: partner.preference,
              profileImageBase64: partner.profileImageBase64 || null,
            },
          },
        ],
        acceptedUsers: new Set(),
      };

      activeRooms.set(roomID, room);
      socket.join(roomID);
      partner.socket.join(roomID);

      socket.emit('match_found', {
        roomID,
        partnerName: room.participants[1].user.name,
        partnerImageBase64: room.participants[1].user.profileImageBase64,
      });
      partner.socket.emit('match_found', {
        roomID,
        partnerName: room.participants[0].user.name,
        partnerImageBase64: room.participants[0].user.profileImageBase64,
      });

      console.log('Matched:', roomID);
    } else {
      waitingUsers.push({
        socket,
        name: userData.name || 'Guest',
        gender: userData.gender,
        preference: userData.preference,
        profileImageBase64: userData.profileImageBase64 || null,
      });

      console.log('Waiting for partner...');
    }
  });

  // identify this socket as a particular user id (e.g., from local profile)
  socket.on('identify', (data) => {
    const token = data?.token;
    if (!token) { console.log('identify: no token'); return; }
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      socket.userId = payload.sub;
      console.log('Socket identified as user:', socket.userId);
    } catch (err) { console.log('identify token invalid'); }
  });

  // simple deck-like matchmaking: store likes and detect mutual likes between connected users
  // in-memory store (volatile)
  if (!io._likes) io._likes = new Map(); // key: targetUserId, value: Set of fromUserId

  socket.on('deck_like', async (data) => {
    try {
      const { targetUserId } = data || {};
      const fromUserId = socket.userId;
      if (!fromUserId || !targetUserId) return;
      const now = Date.now();
      const likeId = require('crypto').randomUUID();
      // persist like
      await addLikeRecord({ id: likeId, from_user: fromUserId, to_user: targetUserId, created_at: now });

      // check mutual like
      const mutual = await hasLike(targetUserId, fromUserId);
      if (mutual) {
        // notify sockets for both users
        for (const [id, s] of io.of('/').sockets) {
          if (s.userId === fromUserId || s.userId === targetUserId) {
            s.emit('matched', { with: s.userId === fromUserId ? targetUserId : fromUserId });
          }
        }
      }
    } catch (err) {
      console.warn('deck_like handler error', err.message);
    }
  });

  socket.on('accept_call', (data) => {
    const roomID = data?.roomID;
    if (!roomID) {
      return;
    }

    const room = activeRooms.get(roomID);
    if (!room) {
      return;
    }

    room.acceptedUsers.add(socket.id);

    if (room.acceptedUsers.size === room.participants.length) {
      io.to(roomID).emit('call_accepted', { roomID });
    }
  });

  socket.on('reject_call', (data) => {
    const roomID = data?.roomID;
    if (!roomID) {
      return;
    }

    const room = activeRooms.get(roomID);
    if (!room) {
      return;
    }

    requeueRemainingParticipant(room, socket.id);
    io.to(roomID).emit('call_rejected', { roomID });
    cleanupRoom(roomID);
  });

  socket.on('leave_room', (data) => {
    const roomID = data?.roomID;
    if (!roomID) {
      return;
    }

    const room = activeRooms.get(roomID);
    if (!room) {
      return;
    }

    room.participants.forEach(({ socket: participantSocket }) => {
      if (participantSocket.id !== socket.id) {
        participantSocket.emit('room_left', { roomID });
      }
    });

    requeueRemainingParticipant(room, socket.id);
    cleanupRoom(roomID);
  });

  socket.on('send_message', (messageData) => {
    if (!messageData || !messageData.roomID) {
      return;
    }

    const roomID = messageData.roomID;
    socket.to(roomID).emit('receive_message', messageData);
  });

  // Simple signaling relay for WebRTC: forward 'signal' events to the room
  socket.on('signal', (data) => {
    try {
      const roomID = data?.roomID;
      if (!roomID) return;
      socket.to(roomID).emit('signal', { from: socket.id, signal: data.signal });
    } catch (err) {
      console.warn('Error relaying signal:', err.message);
    }
  });

  socket.on('typing', (data) => {
    if (!data || !data.roomID) {
      return;
    }

    const roomID = data.roomID;
    socket.to(roomID).emit('typing');
  });

  socket.on('stop_typing', (data) => {
    if (!data || !data.roomID) {
      return;
    }

    const roomID = data.roomID;
    socket.to(roomID).emit('stop_typing');
  });

  socket.on('disconnect', () => {
    removeWaitingUser(socket.id);

    for (const [roomID, room] of activeRooms.entries()) {
      const participant = room.participants.find(({ socket: participantSocket }) => participantSocket.id === socket.id);
      if (participant) {
        room.participants.forEach(({ socket: participantSocket }) => {
          if (participantSocket.id !== socket.id) {
            participantSocket.emit('room_left', { roomID });
          }
        });
        requeueRemainingParticipant(room, socket.id);
        cleanupRoom(roomID);
        break;
      }
    }

    console.log('User Disconnected:', socket.id);
  });
});

// Story upload endpoint
app.post('/api/stories', async (req, res) => {
  try {
    const { dataUrl, caption } = req.body || {};
    const payload = authFromHeader(req);
    if (!payload || !payload.sub) return res.status(401).json({ error: 'unauthenticated' });
    const userId = payload.sub;
    if (!dataUrl || !userId) return res.status(400).json({ error: 'missing data' });

    const matches = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!matches) return res.status(400).json({ error: 'invalid dataUrl' });

    const ext = matches[1].split('/')[1] || 'jpg';
    const b64 = matches[2];
    const buffer = Buffer.from(b64, 'base64');
    const id = require('crypto').randomUUID();
    const filename = `${id}.${ext}`;
    const filepath = path.join('stories', filename);
    const absPath = path.join(__dirname, 'public', filepath);
    fs.writeFileSync(absPath, buffer);

    const created = Date.now();
    addStoryRecord({ id, user_id: userId, file_path: `/${filepath}`, caption: caption||null, created_at: created });

    return res.json({ id, url: `/${filepath}`, created_at: created });
  } catch (err) {
    console.error('story upload error', err);
    return res.status(500).json({ error: 'server error' });
  }
});

// engagement event reporting: view, click, etc.
app.post('/api/engagements', async (req, res) => {
  try{
    const { target_type, target_id, event_type, duration_ms } = req.body || {};
    const payload = authFromHeader(req);
    const userId = payload?payload.sub:null;
    const id = require('crypto').randomUUID();
    const created = Date.now();
    const ev = { id, user_id: userId, target_type, target_id, event_type, duration_ms: duration_ms||0, created_at: created };
    await addEngagementRecord(ev);
    return res.json({ success:true, id });
  }catch(err){ console.error('engagement post error', err); return res.status(500).json({ error:'server' }); }
});

// Reels endpoints: upload and list
app.post('/api/reels', upload.single('video'), async (req, res) => {
  try {
    const payload = authFromHeader(req);
    if (!payload || !payload.sub) return res.status(401).json({ error: 'unauthenticated' });
    const userId = payload.sub;
    if (!req.file) return res.status(400).json({ error: 'no file uploaded' });
    const id = require('crypto').randomUUID();
    const filename = req.file.filename;
    const filepath = path.join('uploads', 'reels', filename);
    const created = Date.now();
    await addReelRecord({ id, user_id: userId, file_path: `/${filepath}`, caption: req.body.caption||null, created_at: created });
    return res.json({ id, url: `/${filepath}`, created_at: created });
  } catch (err) {
    console.error('reel upload error', err);
    return res.status(500).json({ error: 'server error' });
  }
});

app.get('/api/reels', async (_req, res) => {
  try{
    const rows = await getReels();
    // compute a score per reel using engagement retention
    const scored = await Promise.all(rows.map(async (r) => {
      const engagements = await getEngagementsForTarget('reel', r.id);
      const viewEvents = engagements.filter(e=>e.event_type==='view' && e.duration_ms);
      const avgDuration = viewEvents.length? Math.round(viewEvents.reduce((s,ev)=>s+(ev.duration_ms||0),0)/viewEvents.length):0;
      const normRetention = Math.min(1, avgDuration/30000);
      const recencyBoost = Math.min(1, (Date.now() - (r.created_at||0)) / (1000*60*60*24) < 3 ? 1 : 0);
      const score = Math.round((normRetention*0.6 + recencyBoost*0.4) * 100);
      return Object.assign({}, r, { score, avg_view_ms: avgDuration });
    }));
    scored.sort((a,b)=>b.score - a.score);
    res.json(scored);
  }catch(e){ res.status(500).json([]); }
});

// Posts endpoints: image + caption
app.post('/api/posts', upload.single('image'), async (req, res) => {
  try {
    const payload = authFromHeader(req);
    if (!payload || !payload.sub) return res.status(401).json({ error: 'unauthenticated' });
    const userId = payload.sub;
    if (!req.file) return res.status(400).json({ error: 'no file uploaded' });
    const id = require('crypto').randomUUID();
    const filename = req.file.filename;
    const filepath = path.join('uploads', 'posts', filename);
    const created = Date.now();
    await addPostRecord({ id, user_id: userId, image_path: `/${filepath}`, caption: req.body.caption||null, created_at: created });
    return res.json({ id, url: `/${filepath}`, created_at: created });
  } catch (err) {
    console.error('post upload error', err);
    return res.status(500).json({ error: 'server error' });
  }
});

app.get('/api/posts', async (_req, res) => {
  try{
    const rows = await getPosts();
    res.json(rows);
  }catch(e){ res.status(500).json([]); }
});

// Google OAuth routes
app.get('/auth/google', (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !redirectUri) return res.status(500).send('Google OAuth not configured');
  const state = require('crypto').randomBytes(8).toString('hex');
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'select_account'
  });
  res.redirect('https://accounts.google.com/o/oauth2/v2/auth?' + params.toString());
});

app.get('/auth/google/callback', async (req, res) => {
  try {
    const code = req.query.code;
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;
    if (!code || !clientId || !clientSecret || !redirectUri) return res.status(400).send('Invalid google oauth callback');
    const tokenRes = await axios.post('https://oauth2.googleapis.com/token', new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
    }).toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    const idToken = tokenRes.data.id_token;
    if (!idToken) return res.status(500).send('No id_token');
    // validate token
    const info = await axios.get('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken));
    if (info.data.aud !== clientId) return res.status(400).send('Invalid token audience');
    const email = info.data.email;
    const name = info.data.name || email.split('@')[0];
    let user = null;
    try { user = await findUserByEmail(email); } catch(e){}
    if (!user){
      const id = require('crypto').randomUUID();
      const rec = { id, email, name, created_at: Date.now() };
      await addUser(rec);
      user = rec;
    }
    const token = jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    // redirect to client app with token
    return res.redirect('/app.html?token=' + encodeURIComponent(token));
  } catch (err) {
    console.error('google callback error', err.message);
    return res.status(500).send('Google auth failed');
  }
});

app.get('/api/stories', async (_req, res) => {
  const rows = await getRecentStories();
  res.json(rows);
});

// Purge old stories and likes every 5 minutes
cron.schedule('*/5 * * * *', async () => {
  try {
    await purgeOldStories();
    await purgeOldLikes();
    console.info('Purged old stories and likes older than 24h');
  } catch (err) {
    console.warn('Purge task failed', err.message);
  }
});

const HEARTBEAT_URL = process.env.HEARTBEAT_URL;

if (HEARTBEAT_URL) {
  cron.schedule('*/5 * * * *', async () => {
    try {
      console.log('Sending automatic background heartbeat...');
      await axios.get(HEARTBEAT_URL, { timeout: 10000 });
      console.log('Heartbeat ping sent successfully.');
    } catch (err) {
      console.log('Heartbeat ping failed:', err.message);
    }
  });
}

const PORT = process.env.PORT || 3000;
// Optional Sentry integration if present via environment variable
if (process.env.SENTRY_DSN) {
  try {
    const Sentry = require('@sentry/node');
    Sentry.init({ dsn: process.env.SENTRY_DSN, environment: process.env.NODE_ENV || 'production' });
    console.log('Sentry initialized');
  } catch (e) {
    console.warn('Sentry not installed locally; skipping Sentry init');
  }
}

// create logs dir
const logsDir = path.join(__dirname, 'logs'); if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

function writeErrorTrace(name, err) {
  try {
    const fname = path.join(logsDir, `${name.replace(/[^a-z0-9]/gi,'_')}_${Date.now()}.log`);
    const payload = { ts: new Date().toISOString(), pid: process.pid, err: { message: err && err.message, stack: err && err.stack } };
    fs.writeFileSync(fname, JSON.stringify(payload, null, 2));
    console.error('Saved error trace to', fname);
  } catch (e) {
    console.error('Failed to write error trace', e.message);
  }
}

async function handleFatalError(err, origin) {
  try {
    console.error('Fatal error captured', origin || 'unknown', err && err.message);
    writeErrorTrace(origin || 'fatal', err || {});
    // graceful shutdown - stop accepting new connections
    try { server.close(); } catch (e) { /* ignore */ }
    try { io && io.close && io.close(); } catch (e) { /* ignore */ }

    // optional self-restart behavior (use with caution). Requires SELF_RESTART=1 in env
    if (process.env.SELF_RESTART === '1') {
      try {
        const { spawn } = require('child_process');
        const out = fs.openSync(path.join(logsDir,'restart.out.log'),'a');
        const errOut = fs.openSync(path.join(logsDir,'restart.err.log'),'a');
        const child = spawn(process.execPath, [process.argv[1]], { detached: true, stdio: ['ignore', out, errOut] });
        child.unref();
        console.log('Spawned detached restart process (pid=', child.pid, ')');
      } catch (e) {
        console.error('Failed to spawn restart process', e && e.message);
      }
    }
  } finally {
    // exit current process to avoid inconsistent state
    process.exit(1);
  }
}

process.on('uncaughtException', (err) => handleFatalError(err, 'uncaughtException'));
process.on('unhandledRejection', (reason) => handleFatalError(reason, 'unhandledRejection'));

server.listen(PORT, () => {
  console.log(`✅ Server Running on port ${PORT}`);
});
