const socket = io();

let localStream = null;
let pc = null;
let currentRoom = null;

const servers = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const nextBtn = document.getElementById('startBtn');
const chatList = document.getElementById('chatList');
const chatInput = document.getElementById('chatInput');
const sendChatBtn = document.getElementById('sendChatBtn');

function appendChat(message, fromSelf = false) {
  const li = document.createElement('div');
  li.className = fromSelf ? 'chat-row self' : 'chat-row';
  li.textContent = message;
  chatList.appendChild(li);
  chatList.scrollTop = chatList.scrollHeight;
}

async function startLocalStream() {
  if (localStream) return localStream;
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;
    return localStream;
  } catch (err) {
    console.error('getUserMedia error', err);
    alert('Unable to access camera/microphone.');
  }
}

function createPeerConnection(roomID, isOfferer = false) {
  pc = new RTCPeerConnection(servers);

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('signal', { roomID, signal: { candidate: event.candidate } });
    }
  };

  pc.ontrack = (event) => {
    remoteVideo.srcObject = event.streams[0];
  };

  // Add local tracks
  if (localStream) {
    localStream.getTracks().forEach((t) => pc.addTrack(t, localStream));
  }

  return pc;
}

async function negotiateAsOffer(roomID) {
  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit('signal', { roomID, signal: { sdp: pc.localDescription } });
  } catch (err) {
    console.error('Offer error', err);
  }
}

socket.on('match_found', async (data) => {
  if (!data || !data.roomID) return;
  currentRoom = data.roomID;
  await startLocalStream();
  createPeerConnection(currentRoom, true);
  await negotiateAsOffer(currentRoom);
});

socket.on('signal', async (data) => {
  if (!data || !data.signal) return;
  const signal = data.signal;
  if (!pc) {
    createPeerConnection(currentRoom, false);
  }

  if (signal.sdp) {
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
      if (signal.sdp.type === 'offer') {
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('signal', { roomID: currentRoom, signal: { sdp: pc.localDescription } });
      }
    } catch (err) {
      console.error('SDP handling error', err);
    }
  } else if (signal.candidate) {
    try {
      await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
    } catch (err) {
      console.error('ICE candidate error', err);
    }
  }
});

socket.on('receive_message', (msg) => {
  appendChat(msg.text || JSON.stringify(msg), false);
});

socket.on('room_left', () => {
  appendChat('Partner left the room');
  if (pc) {
    pc.close();
    pc = null;
  }
  remoteVideo.srcObject = null;
  currentRoom = null;
});

async function startMatching() {
  await startLocalStream();
  socket.emit('find_match', { name: 'Guest' });
  appendChat('Searching for a match...');
}

function stopMatching() {
  if (currentRoom) {
    socket.emit('leave_room', { roomID: currentRoom });
  }
  if (pc) {
    pc.close();
    pc = null;
  }
  remoteVideo.srcObject = null;
  appendChat('Stopped matching.');
}

startBtn?.addEventListener('click', async () => {
  if (currentRoom) {
    // Next: leave and start again
    stopMatching();
    setTimeout(startMatching, 500);
  } else {
    startMatching();
  }
});

stopBtn?.addEventListener('click', () => {
  stopMatching();
});

sendChatBtn?.addEventListener('click', () => {
  const text = chatInput.value.trim();
  if (!text || !currentRoom) return;
  socket.emit('send_message', { roomID: currentRoom, text, sender: 'You' });
  appendChat(text, true);
  chatInput.value = '';
});

// Allow Enter key to send
chatInput?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    sendChatBtn.click();
  }
});
