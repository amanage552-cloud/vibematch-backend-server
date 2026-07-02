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

// ensure directories
const storiesDir = path.join(__dirname, 'public', 'stories');
if (!fs.existsSync(storiesDir)) fs.mkdirSync(storiesDir, { recursive: true });
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// simple JSON-backed stores for stories and likes
const STORIES_FILE = path.join(dataDir, 'stories.json');
const LIKES_FILE = path.join(dataDir, 'likes.json');

function loadJsonSafe(filePath){
  try { if (!fs.existsSync(filePath)) return []; const raw = fs.readFileSync(filePath,'utf8'); return JSON.parse(raw || '[]'); } catch (e) { return []; }
}
function saveJsonSafe(filePath, obj){ fs.writeFileSync(filePath, JSON.stringify(obj, null, 2)); }

function addStoryRecord(rec){ const arr = loadJsonSafe(STORIES_FILE); arr.push(rec); saveJsonSafe(STORIES_FILE, arr); }
function getRecentStories(){ const arr = loadJsonSafe(STORIES_FILE); const cutoff = Date.now() - 24*60*60*1000; return arr.filter(r=>r.created_at>cutoff).sort((a,b)=>b.created_at-a.created_at); }
function purgeOldStories(){ const arr = loadJsonSafe(STORIES_FILE); const cutoff = Date.now() - 24*60*60*1000; const kept = arr.filter(r=>r.created_at>cutoff); saveJsonSafe(STORIES_FILE, kept); }

function addLikeRecord(rec){ const arr = loadJsonSafe(LIKES_FILE); arr.push(rec); saveJsonSafe(LIKES_FILE, arr); }
function hasLike(from, to){ const arr = loadJsonSafe(LIKES_FILE); return arr.find(l=>l.from_user===from && l.to_user===to); }
function purgeOldLikes(){ const arr = loadJsonSafe(LIKES_FILE); const cutoff = Date.now() - 24*60*60*1000; const kept = arr.filter(r=>r.created_at>cutoff); saveJsonSafe(LIKES_FILE, kept); }

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
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

app.get('/api/online', (_req, res) => {
  const online = [
    { id: 'mia', name: 'Mia', avatar: '/images/ava1.jpg' },
    { id: 'noah', name: 'Noah', avatar: '/images/ava2.jpg' },
    { id: 'siena', name: 'Siena', avatar: '/images/ava3.jpg' }
  ];
  res.json(online);
});

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
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
    const userId = data?.userId;
    if (!userId) return;
    socket.userId = userId;
    // store on socket object; we can also maintain a global map if needed
    console.log('Socket identified as user:', userId);
  });

  // simple deck-like matchmaking: store likes and detect mutual likes between connected users
  // in-memory store (volatile)
  if (!io._likes) io._likes = new Map(); // key: targetUserId, value: Set of fromUserId

  socket.on('deck_like', (data) => {
    try {
      const { fromUserId, targetUserId } = data || {};
      if (!fromUserId || !targetUserId) return;
      const now = Date.now();
      const likeId = require('crypto').randomUUID();
      // persist like
      addLikeRecord({ id: likeId, from_user: fromUserId, to_user: targetUserId, created_at: now });

      // check mutual like
      const mutual = hasLike(targetUserId, fromUserId);
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
    const { userId, dataUrl, caption } = req.body || {};
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

app.get('/api/stories', (_req, res) => {
  const rows = getRecentStories();
  res.json(rows);
});

// Purge old stories and likes every 5 minutes
cron.schedule('*/5 * * * *', () => {
  try {
    purgeOldStories();
    purgeOldLikes();
    console.info('Purged old stories and likes older than 24h (JSON store)');
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
server.listen(PORT, () => {
  console.log(`✅ Server Running on port ${PORT}`);
});
