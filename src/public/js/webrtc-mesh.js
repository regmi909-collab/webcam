/**
 * OmniCall - WebRTC Mesh Engine
 * Fully decentralized P2P video/audio conferencing using WebSockets signaling.
 * Zero server bandwidth for media streams; direct P2P mesh up to 8 peers.
 */

class WebRTCMeshEngine {
  constructor(options = {}) {
    this.options = options;
    this.ws = null;
    this.peerConnections = new Map(); // peerId -> RTCPeerConnection
    this.dataChannels = new Map();    // peerId -> RTCDataChannel
    this.localStream = null;
    this.localScreenStream = null;
    this.peerId = 'peer_' + Math.random().toString(36).substring(2, 9);
    this.userName = options.userName || 'Anonymous';
    this.roomName = options.roomName || 'default';
    this.iceServers = options.iceServers || [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ];
    this.events = new Map();
  }

  on(event, handler) {
    if (!this.events.has(event)) this.events.set(event, []);
    this.events.get(event).push(handler);
  }

  emit(event, ...args) {
    if (this.events.has(event)) {
      this.events.get(event).forEach(fn => fn(...args));
    }
  }

  async connect(localStream) {
    this.localStream = localStream;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const serverUrl = this.options.serverUrl || `${protocol}//${window.location.host}/signaling`;

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(serverUrl);
      } catch (err) {
        return reject(err);
      }

      this.ws.onopen = () => {
        console.log('[Mesh] Connected to signaling server');
        this.ws.send(JSON.stringify({
          type: 'join',
          room: this.roomName,
          peerId: this.peerId,
          name: this.userName
        }));
        resolve();
      };

      this.ws.onerror = (err) => {
        console.error('[Mesh] WebSocket error', err);
        reject(err);
      };

      this.ws.onmessage = async (event) => {
        let msg;
        try {
          msg = JSON.parse(event.data);
        } catch (e) {
          return;
        }

        await this.handleSignalingMessage(msg);
      };

      this.ws.onclose = () => {
        console.log('[Mesh] Disconnected from signaling server');
        this.emit('disconnected');
      };
    });
  }

  async handleSignalingMessage(msg) {
    switch (msg.type) {
      case 'room-joined': {
        console.log(`[Mesh] Joined room ${msg.room}. Existing peers:`, msg.peers);
        // Connect to existing peers (we initiate offer to each existing peer)
        for (const peer of msg.peers) {
          await this.createPeerConnection(peer.peerId, peer.name, true);
        }
        break;
      }

      case 'peer-joined': {
        console.log(`[Mesh] New peer joined: ${msg.name} (${msg.peerId})`);
        // Peer will initiate connection to us
        await this.createPeerConnection(msg.peerId, msg.name, false);
        break;
      }

      case 'offer': {
        const pc = this.peerConnections.get(msg.sender);
        if (pc) {
          await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          this.sendSignal({
            type: 'answer',
            target: msg.sender,
            sdp: answer
          });
        }
        break;
      }

      case 'answer': {
        const pc = this.peerConnections.get(msg.sender);
        if (pc) {
          await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
        }
        break;
      }

      case 'ice-candidate': {
        const pc = this.peerConnections.get(msg.sender);
        if (pc && msg.candidate) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
          } catch (e) {
            console.warn('[Mesh] Error adding ICE candidate', e);
          }
        }
        break;
      }

      case 'peer-left': {
        console.log(`[Mesh] Peer left: ${msg.peerId}`);
        this.closePeer(msg.peerId);
        this.emit('peer-disconnected', msg.peerId);
        break;
      }

      case 'chat-message': {
        this.emit('chat-message', {
          senderId: msg.sender,
          senderName: msg.senderName,
          text: msg.text,
          timestamp: msg.timestamp
        });
        break;
      }
    }
  }

  async createPeerConnection(remotePeerId, remotePeerName, isInitiator) {
    if (this.peerConnections.has(remotePeerId)) {
      return this.peerConnections.get(remotePeerId);
    }

    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    this.peerConnections.set(remotePeerId, pc);

    // Add local media tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        pc.addTrack(track, this.localStream);
      });
    }

    // Remote track handler
    pc.ontrack = (event) => {
      const remoteStream = event.streams[0] || new MediaStream([event.track]);
      this.emit('peer-stream', {
        peerId: remotePeerId,
        peerName: remotePeerName,
        stream: remoteStream,
        track: event.track
      });
    };

    // ICE Candidate handler
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignal({
          type: 'ice-candidate',
          target: remotePeerId,
          candidate: event.candidate
        });
      }
    };

    // Data Channel for instant chat & direct P2P file transfers
    if (isInitiator) {
      const dc = pc.createDataChannel('omnicall-data', { ordered: true });
      this.setupDataChannel(remotePeerId, dc);

      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });
      await pc.setLocalDescription(offer);
      this.sendSignal({
        type: 'offer',
        target: remotePeerId,
        sdp: offer
      });
    } else {
      pc.ondatachannel = (event) => {
        this.setupDataChannel(remotePeerId, event.channel);
      };
    }

    return pc;
  }

  setupDataChannel(peerId, dc) {
    this.dataChannels.set(peerId, dc);
    let incomingFile = null;

    dc.onmessage = (event) => {
      if (typeof event.data === 'string') {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'file-header') {
            incomingFile = {
              name: data.name,
              size: data.size,
              mimeType: data.mimeType,
              chunks: [],
              receivedBytes: 0
            };
          } else if (data.type === 'chat') {
            this.emit('chat-message', {
              senderId: peerId,
              senderName: data.senderName,
              text: data.text,
              timestamp: data.timestamp
            });
          }
        } catch (e) {
          // Plain text fallback
        }
      } else if (event.data instanceof ArrayBuffer) {
        if (incomingFile) {
          incomingFile.chunks.push(event.data);
          incomingFile.receivedBytes += event.data.byteLength;
          if (incomingFile.receivedBytes >= incomingFile.size) {
            const blob = new Blob(incomingFile.chunks, { type: incomingFile.mimeType });
            this.emit('file-received', {
              senderId: peerId,
              fileName: incomingFile.name,
              fileSize: incomingFile.size,
              blob
            });
            incomingFile = null;
          }
        }
      }
    };
  }

  sendSignal(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  sendChat(text) {
    const payload = JSON.stringify({
      type: 'chat',
      senderName: this.userName,
      text,
      timestamp: Date.now()
    });

    // Send via DataChannel to peers
    let sentCount = 0;
    this.dataChannels.forEach((dc) => {
      if (dc.readyState === 'open') {
        dc.send(payload);
        sentCount++;
      }
    });

    // If no direct data channel is open, fallback to signaling broadcast
    if (sentCount === 0 && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'chat-broadcast',
        text
      }));
    }
  }

  async sendFile(file) {
    const CHUNK_SIZE = 16384; // 16KB WebRTC chunk
    const header = JSON.stringify({
      type: 'file-header',
      name: file.name,
      size: file.size,
      mimeType: file.type || 'application/octet-stream'
    });

    this.dataChannels.forEach(dc => {
      if (dc.readyState === 'open') {
        dc.send(header);
      }
    });

    const buffer = await file.arrayBuffer();
    for (let offset = 0; offset < buffer.byteLength; offset += CHUNK_SIZE) {
      const slice = buffer.slice(offset, offset + CHUNK_SIZE);
      this.dataChannels.forEach(dc => {
        if (dc.readyState === 'open') {
          dc.send(slice);
        }
      });
    }
  }

  replaceTrack(newTrack, kind) {
    this.peerConnections.forEach((pc) => {
      const sender = pc.getSenders().find(s => s.track && s.track.kind === kind);
      if (sender) {
        sender.replaceTrack(newTrack);
      } else if (newTrack) {
        pc.addTrack(newTrack, this.localStream);
      }
    });
  }

  closePeer(peerId) {
    if (this.peerConnections.has(peerId)) {
      this.peerConnections.get(peerId).close();
      this.peerConnections.delete(peerId);
    }
    if (this.dataChannels.has(peerId)) {
      this.dataChannels.delete(peerId);
    }
  }

  disconnect() {
    this.peerConnections.forEach(pc => pc.close());
    this.peerConnections.clear();
    this.dataChannels.clear();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

window.WebRTCMeshEngine = WebRTCMeshEngine;
