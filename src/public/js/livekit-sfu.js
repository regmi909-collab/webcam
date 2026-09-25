/**
 * OmniCall - LiveKit SFU Engine
 * Enterprise Selective Forwarding Unit (SFU) architecture for 10-100+ caller conferences.
 * Adaptive bitrate streaming, simulcast, dynamic quality, and ultra-low latency.
 */

class LiveKitSFUEngine {
  constructor(options = {}) {
    this.options = options;
    this.room = null;
    this.roomName = options.roomName || 'default';
    this.userName = options.userName || 'Anonymous';
    this.identity = 'user_' + Math.random().toString(36).substring(2, 9);
    this.events = new Map();
    this.incomingFiles = new Map();
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
    if (!window.LivekitClient) {
      throw new Error('LiveKit client library not loaded');
    }

    const { Room, RoomEvent, Track } = window.LivekitClient;

    // 1. Fetch JWT Access Token from OmniCall Server
    const apiHost = this.options.apiHost || window.location.origin;
    const tokenRes = await fetch(`${apiHost}/api/livekit/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        room: this.roomName,
        identity: this.identity,
        name: this.userName
      })
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.json().catch(() => ({}));
      throw new Error(err.details || 'Failed to acquire LiveKit room token');
    }

    const { token, url: livekitUrl } = await tokenRes.json();
    const targetWsUrl = this.options.livekitUrl || livekitUrl || 'ws://localhost:7880';

    console.log(`[LiveKit SFU] Connecting to ${targetWsUrl} for room ${this.roomName}`);

    // 2. Initialize LiveKit Room with dynamic adaptive streaming
    this.room = new Room({
      adaptiveStream: true,
      dynacast: true,
      audioCaptureDefaults: {
        autoGainControl: true,
        echoCancellation: true,
        noiseSuppression: true
      },
      videoCaptureDefaults: {
        resolution: { width: 1280, height: 720, frameRate: 30 }
      }
    });

    // 3. Set up event listeners
    this.room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      console.log(`[LiveKit SFU] Subscribed to ${track.kind} from ${participant.identity}`);
      this.emit('track-subscribed', {
        track,
        participant,
        stream: new MediaStream([track.mediaStreamTrack])
      });
    });

    this.room.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
      this.emit('track-unsubscribed', { track, participant });
    });

    this.room.on(RoomEvent.ParticipantConnected, (participant) => {
      console.log(`[LiveKit SFU] Participant joined: ${participant.name || participant.identity}`);
      this.emit('peer-connected', {
        peerId: participant.identity,
        name: participant.name || participant.identity
      });
    });

    this.room.on(RoomEvent.ParticipantDisconnected, (participant) => {
      console.log(`[LiveKit SFU] Participant left: ${participant.identity}`);
      this.emit('peer-disconnected', participant.identity);
    });

    this.room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
      const speakerIds = speakers.map(s => s.identity);
      this.emit('active-speakers', speakerIds);
    });

    this.room.on(RoomEvent.DataReceived, (payload, participant) => {
      try {
        const text = new TextDecoder().decode(payload);
        const data = JSON.parse(text);

        if (data.type === 'chat') {
          this.emit('chat-message', {
            senderId: participant ? participant.identity : 'server',
            senderName: data.senderName,
            text: data.text,
            timestamp: data.timestamp
          });
        } else if (data.type === 'file-header') {
          this.incomingFiles.set(data.fileId, {
            name: data.name,
            size: data.size,
            mimeType: data.mimeType,
            chunks: [],
            receivedBytes: 0,
            senderName: data.senderName
          });
        } else if (data.type === 'file-chunk') {
          const file = this.incomingFiles.get(data.fileId);
          if (file) {
            const rawChunk = Uint8Array.from(atob(data.chunk), c => c.charCodeAt(0));
            file.chunks.push(rawChunk);
            file.receivedBytes += rawChunk.byteLength;
            if (file.receivedBytes >= file.size) {
              const blob = new Blob(file.chunks, { type: file.mimeType });
              this.emit('file-received', {
                senderId: participant ? participant.identity : 'peer',
                senderName: file.senderName,
                fileName: file.name,
                fileSize: file.size,
                blob
              });
              this.incomingFiles.delete(data.fileId);
            }
          }
        }
      } catch (e) {
        console.warn('[LiveKit SFU] Could not parse data message', e);
      }
    });

    // 4. Connect to Room
    await this.room.connect(targetWsUrl, token);
    console.log('[LiveKit SFU] Connected successfully!');

    // 5. Publish local media tracks from pre-existing preview stream or capture anew
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      const videoTrack = localStream.getVideoTracks()[0];

      if (audioTrack) {
        await this.room.localParticipant.publishTrack(audioTrack, {
          name: 'audio',
          source: Track.Source.Microphone
        });
      }
      if (videoTrack) {
        await this.room.localParticipant.publishTrack(videoTrack, {
          name: 'video',
          source: Track.Source.Camera,
          simulcast: true
        });
      }
    }

    return this.room;
  }

  async setMicrophoneEnabled(enabled) {
    if (this.room) {
      await this.room.localParticipant.setMicrophoneEnabled(enabled);
    }
  }

  async setCameraEnabled(enabled) {
    if (this.room) {
      await this.room.localParticipant.setCameraEnabled(enabled);
    }
  }

  async startScreenShare(customTrack) {
    if (!this.room) return;
    if (customTrack) {
      const { Track } = window.LivekitClient;
      await this.room.localParticipant.publishTrack(customTrack, {
        name: 'screen',
        source: Track.Source.ScreenShare
      });
    } else {
      await this.room.localParticipant.setScreenShareEnabled(true);
    }
  }

  async stopScreenShare() {
    if (this.room) {
      await this.room.localParticipant.setScreenShareEnabled(false);
    }
  }

  sendChat(text) {
    if (!this.room) return;
    const payload = JSON.stringify({
      type: 'chat',
      senderName: this.userName,
      text,
      timestamp: Date.now()
    });

    const encoded = new TextEncoder().encode(payload);
    this.room.localParticipant.publishData(encoded, { reliable: true });
  }

  async sendFile(file) {
    if (!this.room) return;
    const fileId = 'file_' + Math.random().toString(36).substring(2, 9);
    const header = JSON.stringify({
      type: 'file-header',
      fileId,
      name: file.name,
      size: file.size,
      mimeType: file.type || 'application/octet-stream',
      senderName: this.userName
    });

    this.room.localParticipant.publishData(new TextEncoder().encode(header), { reliable: true });

    const buffer = await file.arrayBuffer();
    const CHUNK_SIZE = 14000; // Safe chunk size for LiveKit data messages

    for (let offset = 0; offset < buffer.byteLength; offset += CHUNK_SIZE) {
      const slice = buffer.slice(offset, offset + CHUNK_SIZE);
      const binaryStr = Array.from(new Uint8Array(slice)).map(b => String.fromCharCode(b)).join('');
      const chunkMsg = JSON.stringify({
        type: 'file-chunk',
        fileId,
        chunk: btoa(binaryStr)
      });
      await this.room.localParticipant.publishData(new TextEncoder().encode(chunkMsg), { reliable: true });
    }
  }

  disconnect() {
    if (this.room) {
      this.room.disconnect();
      this.room = null;
    }
  }
}

window.LiveKitSFUEngine = LiveKitSFUEngine;
