const http = require('http');
const path = require('path');
const express = require('express');
const cors = require('cors');
const { WebSocketServer, WebSocket } = require('ws');
const { AccessToken } = require('livekit-server-sdk');

const PORT = process.env.PORT || 3000;
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || 'devkey';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || 'secret';
const LIVEKIT_URL = process.env.LIVEKIT_URL || 'ws://localhost:7880';
const TURN_URL = process.env.TURN_URL || '';
const TURN_USERNAME = process.env.TURN_USERNAME || '';
const TURN_CREDENTIAL = process.env.TURN_CREDENTIAL || '';

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'src', 'public')));

// API: Server configuration & ICE servers
app.get('/api/config', (req, res) => {
  const iceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
  ];

  if (TURN_URL) {
    iceServers.push({
      urls: TURN_URL,
      username: TURN_USERNAME,
      credential: TURN_CREDENTIAL
    });
  }

  res.json({
    livekitUrl: LIVEKIT_URL,
    iceServers,
    turnEnabled: Boolean(TURN_URL)
  });
});

// API: LiveKit Token Generator
app.post('/api/livekit/token', async (req, res) => {
  try {
    const { room, identity, name } = req.body;
    if (!room || !identity) {
      return res.status(400).json({ error: 'Room and identity are required' });
    }

    const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity,
      name: name || identity,
      ttl: '24h' // 24-hour unlimited call sessions
    });

    at.addGrant({
      roomJoin: true,
      room,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true
    });

    const token = await at.toJwt();
    res.json({ token, url: LIVEKIT_URL });
  } catch (err) {
    console.error('Error generating LiveKit token:', err);
    res.status(500).json({ error: 'Failed to generate token', details: err.message });
  }
});

// Fallback to index.html for SPA room routes
app.use((req, res) => {
  res.sendFile(path.join(__dirname, '..', 'src', 'public', 'index.html'));
});

const server = http.createServer(app);

// WebSocket Signaling Server for Built-in P2P Mesh Mode
const wss = new WebSocketServer({ server, path: '/signaling' });
const rooms = new Map(); // roomName -> Set of client sockets

wss.on('connection', (ws) => {
  ws.peerId = null;
  ws.roomName = null;
  ws.userName = null;

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch (e) {
      return;
    }

    switch (msg.type) {
      case 'join': {
        const { room, peerId, name } = msg;
        ws.peerId = peerId;
        ws.roomName = room;
        ws.userName = name || peerId;

        if (!rooms.has(room)) {
          rooms.set(room, new Set());
        }
        const roomClients = rooms.get(room);

        // Tell new user about all existing peers
        const peers = [];
        roomClients.forEach((client) => {
          if (client !== ws && client.readyState === WebSocket.OPEN) {
            peers.push({
              peerId: client.peerId,
              name: client.userName
            });
          }
        });

        ws.send(JSON.stringify({
          type: 'room-joined',
          room,
          peers
        }));

        // Broadcast to existing peers that new user joined
        roomClients.forEach((client) => {
          if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
              type: 'peer-joined',
              peerId: ws.peerId,
              name: ws.userName
            }));
          }
        });

        roomClients.add(ws);
        console.log(`[Signaling] ${ws.userName} (${ws.peerId}) joined room: ${room} [Total: ${roomClients.size}]`);
        break;
      }

      case 'offer':
      case 'answer':
      case 'ice-candidate':
      case 'media-state': {
        // Forward targeted messages to specific peer
        const { target } = msg;
        if (!target || !ws.roomName) return;

        const roomClients = rooms.get(ws.roomName);
        if (roomClients) {
          roomClients.forEach((client) => {
            if (client.peerId === target && client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({
                ...msg,
                sender: ws.peerId,
                senderName: ws.userName
              }));
            }
          });
        }
        break;
      }

      case 'chat-broadcast': {
        // Broadcast chat to all room members
        if (!ws.roomName) return;
        const roomClients = rooms.get(ws.roomName);
        if (roomClients) {
          roomClients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({
                type: 'chat-message',
                sender: ws.peerId,
                senderName: ws.userName,
                text: msg.text,
                timestamp: Date.now()
              }));
            }
          });
        }
        break;
      }

      case 'leave': {
        handleDisconnect(ws);
        break;
      }
    }
  });

  ws.on('close', () => {
    handleDisconnect(ws);
  });

  ws.on('error', (err) => {
    console.error('[Signaling Error]', err.message);
  });
});

function handleDisconnect(ws) {
  if (!ws.roomName || !ws.peerId) return;

  const roomClients = rooms.get(ws.roomName);
  if (roomClients) {
    roomClients.delete(ws);

    // Notify others
    roomClients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({
          type: 'peer-left',
          peerId: ws.peerId,
          name: ws.userName
        }));
      }
    });

    if (roomClients.size === 0) {
      rooms.delete(ws.roomName);
      console.log(`[Signaling] Room ${ws.roomName} cleaned up (empty)`);
    } else {
      console.log(`[Signaling] ${ws.userName} left room ${ws.roomName} [Remaining: ${roomClients.size}]`);
    }
  }

  ws.roomName = null;
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`=======================================================`);
  console.log(`  OmniCall Unlimited Video Calling Server`);
  console.log(`  Local Web & App URL: http://localhost:${PORT}`);
  console.log(`  LiveKit SFU Target:  ${LIVEKIT_URL}`);
  console.log(`  Signaling WebSocket: ws://localhost:${PORT}/signaling`);
  console.log(`=======================================================`);
});
