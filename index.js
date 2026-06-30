const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
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

server.listen(3000, () => {
  console.log('✅ Server Running on http://localhost:3000');
});
