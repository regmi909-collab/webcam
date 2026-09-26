/**
 * OmniCall - Application Controller
 * Handles UI state, hardware access (cameras/mics/screens), calling engines,
 * audio visualization, and meeting workflows.
 */

(function () {
  'use strict';

  // --- State ---
  const state = {
    inCall: false,
    engineType: 'livekit', // 'livekit' or 'mesh'
    engine: null,
    localStream: null,
    screenStream: null,
    audioContext: null,
    analyser: null,
    micLevelAnimationId: null,
    isMuted: false,
    isVideoOff: false,
    isScreenSharing: false,
    roomName: '',
    userName: '',
    callStartTime: null,
    timerInterval: null,
    remotePeers: new Map(), // peerId -> { name, stream, tileEl, videoEl, audioEl }
    unreadMessages: 0,
    activeSpeakerId: null,
    serverConfig: {
      livekitUrl: 'ws://localhost:7880',
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    }
  };

  // --- DOM Elements ---
  const el = {
    // Window titlebar
    titlebar: document.getElementById('window-titlebar'),
    winMin: document.getElementById('win-min-btn'),
    winMax: document.getElementById('win-max-btn'),
    winClose: document.getElementById('win-close-btn'),

    // Views
    lobbyView: document.getElementById('lobby-view'),
    callView: document.getElementById('call-view'),

    // Lobby
    previewVideo: document.getElementById('preview-video'),
    previewCameraOff: document.getElementById('preview-camera-off'),
    lobbyBtnMic: document.getElementById('lobby-btn-mic'),
    lobbyBtnCamera: document.getElementById('lobby-btn-camera'),
    lobbyMicFill: document.getElementById('lobby-mic-fill'),
    inputName: document.getElementById('input-name'),
    inputRoom: document.getElementById('input-room'),
    btnRandomRoom: document.getElementById('btn-random-room'),
    btnJoinRoom: document.getElementById('btn-join-room'),
    btnCopyInvite: document.getElementById('btn-copy-invite'),
    engineOptLivekit: document.getElementById('engine-opt-livekit'),
    engineOptMesh: document.getElementById('engine-opt-mesh'),

    // Call Topbar
    callRoomName: document.getElementById('call-room-name'),
    btnCopyCallLink: document.getElementById('btn-copy-call-link'),
    callDurationTimer: document.getElementById('call-duration-timer'),
    callEngineBadge: document.getElementById('call-engine-badge'),
    btnStatsHud: document.getElementById('btn-stats-hud'),

    // Stage & Grid
    screenShareStage: document.getElementById('screen-share-stage'),
    screenShareVideo: document.getElementById('screen-share-video'),
    videoGrid: document.getElementById('video-grid'),
    localTile: document.getElementById('local-tile'),
    localVideo: document.getElementById('local-video'),
    localAvatar: document.getElementById('local-avatar'),
    localAvatarText: document.getElementById('local-avatar-text'),
    localNameTag: document.getElementById('local-name-tag'),

    // Sidebar & Drawer
    sidebarDrawer: document.getElementById('sidebar-drawer'),
    tabBtnChat: document.getElementById('tab-btn-chat'),
    tabBtnParticipants: document.getElementById('tab-btn-participants'),
    tabContentChat: document.getElementById('tab-content-chat'),
    tabContentParticipants: document.getElementById('tab-content-participants'),
    chatMessagesContainer: document.getElementById('chat-messages-container'),
    chatTextInput: document.getElementById('chat-text-input'),
    btnSendChat: document.getElementById('btn-send-chat'),
    fileInput: document.getElementById('file-input'),
    btnAttachFile: document.getElementById('btn-attach-file'),
    participantsCount: document.getElementById('participants-count'),
    participantsListContainer: document.getElementById('participants-list-container'),

    // Bottom Controls
    ctrlMic: document.getElementById('ctrl-mic'),
    ctrlCam: document.getElementById('ctrl-cam'),
    ctrlScreen: document.getElementById('ctrl-screen'),
    ctrlChat: document.getElementById('ctrl-chat'),
    chatBadge: document.getElementById('chat-badge'),
    ctrlParticipants: document.getElementById('ctrl-participants'),
    ctrlSettings: document.getElementById('ctrl-settings'),
    ctrlFullscreen: document.getElementById('ctrl-fullscreen'),
    ctrlLeave: document.getElementById('ctrl-leave'),

    // Modals
    modalSettings: document.getElementById('modal-settings'),
    closeSettingsModal: document.getElementById('close-settings-modal'),
    saveSettingsBtn: document.getElementById('save-settings-btn'),
    settingCameraSelect: document.getElementById('setting-camera-select'),
    settingMicSelect: document.getElementById('setting-mic-select'),
    settingSpeakerSelect: document.getElementById('setting-speaker-select'),
    settingResolutionSelect: document.getElementById('setting-resolution-select'),
    settingServerUrl: document.getElementById('setting-server-url'),

    modalScreenshare: document.getElementById('modal-screenshare'),
    closeScreenshareModal: document.getElementById('close-screenshare-modal'),
    screenshareSourcesGrid: document.getElementById('screenshare-sources-grid'),

    modalStats: document.getElementById('modal-stats'),
    closeStatsModal: document.getElementById('close-stats-modal'),
    statEngine: document.getElementById('stat-engine'),
    statRtt: document.getElementById('stat-rtt'),
    statLoss: document.getElementById('stat-loss'),
    statResolution: document.getElementById('stat-resolution'),
    statCodec: document.getElementById('stat-codec'),

    toastHud: document.getElementById('toast-hud'),

    // Secure Context / HTTPS Notification
    secureContextBanner: document.getElementById('secure-context-banner'),
    btnSwitchHttps: document.getElementById('btn-switch-https'),
    btnShowChromeFlagHelp: document.getElementById('btn-show-chrome-flag-help'),
    btnCloseBanner: document.getElementById('btn-close-banner'),
    modalChromeFlag: document.getElementById('modal-chrome-flag'),
    closeChromeFlagModal: document.getElementById('close-chrome-flag-modal'),
    btnModalSwitchHttps: document.getElementById('btn-modal-switch-https'),
    flagGuideOrigin: document.getElementById('flag-guide-origin'),

    // Auto-Join & Windows Startup
    settingAutoJoinEnable: document.getElementById('setting-auto-join-enable'),
    settingAutoJoinRoom: document.getElementById('setting-auto-join-room'),
    autoJoinRoomGroup: document.getElementById('auto-join-room-group'),
    settingAutoStartWindows: document.getElementById('setting-auto-start-windows'),
    autoStartWindowsGroup: document.getElementById('auto-start-windows-group')
  };

  // --- Initializer ---
  async function init() {
    setupElectronWindow();
    setupEngineSelection();
    setupLobbyDefaults();
    checkSecureContext();
    await fetchServerConfig();
    await initMediaPreview();
    await enumerateDevices();
    await setupAutoJoinSettings();
    attachEventListeners();
    await checkAutoJoin();
  }

  // --- Electron Desktop Integration ---
  function setupElectronWindow() {
    if (window.electronAPI && window.electronAPI.isElectron) {
      el.winMin.addEventListener('click', () => window.electronAPI.minimize());
      el.winMax.addEventListener('click', () => window.electronAPI.maximize());
      el.winClose.addEventListener('click', () => window.electronAPI.close());
    } else {
      // Running inside standard web browser (Chrome, Edge, Safari, Firefox)
      if (el.titlebar) {
        // Hide window min/max/close buttons for web browser guests
        const controls = document.getElementById('titlebar-controls');
        if (controls) controls.style.display = 'none';
      }
    }
  }

  function getServerTarget() {
    const saved = localStorage.getItem('omnicall_server_target');
    if (saved && saved.trim()) return saved.trim().replace(/\/+$/, '');
    if (window.electronAPI || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return 'http://129.225.108.83';
    }
    return window.location.origin;
  }

  // --- Fetch Server Config ---
  async function fetchServerConfig() {
    const target = getServerTarget();
    if (el.settingServerUrl) {
      el.settingServerUrl.value = target;
    }
    try {
      const res = await fetch(`${target}/api/config`);
      if (res.ok) {
        const config = await res.json();
        state.serverConfig = config;
      }
    } catch (e) {
      console.warn('[OmniCall] Server config fetch error:', e);
    }
  }

  // --- Lobby Setup ---
  function setupLobbyDefaults() {
    // Generate readable random room name
    const randomAdjectives = ['quantum', 'stellar', 'hyper', 'apex', 'cyber', 'neon', 'pulse', 'ultra', 'infinite'];
    const randomNouns = ['falcon', 'summit', 'orbit', 'matrix', 'beacon', 'nexus', 'prism', 'vortex', 'echo'];
    const randomSlug = `${randomAdjectives[Math.floor(Math.random() * randomAdjectives.length)]}-${randomNouns[Math.floor(Math.random() * randomNouns.length)]}-${Math.floor(10 + Math.random() * 90)}`;

    // Parse URL room param if present
    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('room');

    el.inputRoom.value = roomParam ? roomParam.toLowerCase().trim() : randomSlug;

    // Load saved username
    const savedName = localStorage.getItem('omnicall_user_name');
    if (savedName) {
      el.inputName.value = savedName;
    } else {
      el.inputName.value = 'User_' + Math.floor(100 + Math.random() * 900);
    }

    el.btnRandomRoom.addEventListener('click', () => {
      const newSlug = `${randomAdjectives[Math.floor(Math.random() * randomAdjectives.length)]}-${randomNouns[Math.floor(Math.random() * randomNouns.length)]}-${Math.floor(10 + Math.random() * 90)}`;
      el.inputRoom.value = newSlug;
    });

    el.btnCopyInvite.addEventListener('click', copyMeetingLink);
  }

  function setupEngineSelection() {
    const radioLivekit = el.engineOptLivekit.querySelector('input');
    const radioMesh = el.engineOptMesh.querySelector('input');

    el.engineOptLivekit.addEventListener('click', () => {
      radioLivekit.checked = true;
      el.engineOptLivekit.classList.add('active');
      el.engineOptMesh.classList.remove('active');
      state.engineType = 'livekit';
    });

    el.engineOptMesh.addEventListener('click', () => {
      radioMesh.checked = true;
      el.engineOptMesh.classList.add('active');
      el.engineOptLivekit.classList.remove('active');
      state.engineType = 'mesh';
    });
  }

  // --- Secure Context & Browser Media Permissions ---
  function getHttpsUrl() {
    const host = window.location.hostname;
    const path = window.location.pathname || '/';
    const query = window.location.search || (state.roomName ? `?room=${encodeURIComponent(state.roomName)}` : '');
    // If accessing via raw IPv4, route through sslip.io for real Let's Encrypt SSL
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
      return `https://${host}.sslip.io${path}${query}`;
    }
    return `https://${window.location.host}${path}${query}`;
  }

  function checkSecureContext() {
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const isElectron = window.electronAPI && window.electronAPI.isElectron;
    const isSecure = window.isSecureContext || isLocal || isElectron;

    if (!isSecure && el.secureContextBanner) {
      el.secureContextBanner.style.display = 'flex';
      const httpsUrl = getHttpsUrl();
      if (el.btnSwitchHttps) el.btnSwitchHttps.href = httpsUrl;
      if (el.btnModalSwitchHttps) el.btnModalSwitchHttps.href = httpsUrl;
      if (el.flagGuideOrigin) el.flagGuideOrigin.textContent = window.location.origin;
    }
  }

  function updateCameraState(active) {
    const hasTrack = active && state.localStream && state.localStream.getVideoTracks().length > 0 && state.localStream.getVideoTracks()[0].enabled;
    state.isVideoOff = !hasTrack;

    if (hasTrack) {
      if (el.localAvatar) el.localAvatar.style.display = 'none';
      if (el.localVideo) el.localVideo.style.display = 'block';
      if (el.previewCameraOff) el.previewCameraOff.style.display = 'none';
      if (el.previewVideo) el.previewVideo.style.display = 'block';
      if (el.ctrlCam) el.ctrlCam.classList.remove('off');
      if (el.lobbyBtnCamera) el.lobbyBtnCamera.classList.remove('off');
    } else {
      if (el.localAvatar) el.localAvatar.style.display = 'flex';
      if (el.localVideo) el.localVideo.style.display = 'none';
      if (el.previewCameraOff) el.previewCameraOff.style.display = 'flex';
      if (el.previewVideo) el.previewVideo.style.display = 'none';
      if (el.ctrlCam) el.ctrlCam.classList.add('off');
      if (el.lobbyBtnCamera) el.lobbyBtnCamera.classList.add('off');
    }
  }

  // --- Media & Preview ---
  async function initMediaPreview(videoDeviceId = null, audioDeviceId = null) {
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const isElectron = window.electronAPI && window.electronAPI.isElectron;
    const isSecure = window.isSecureContext || isLocal || isElectron;

    if (!isSecure) {
      console.warn('[OmniCall] Insecure HTTP origin detected. Browser strictly requires HTTPS for camera/mic access.');
      updateCameraState(false);
      checkSecureContext();
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.warn('[OmniCall] navigator.mediaDevices not available.');
      updateCameraState(false);
      return;
    }

    try {
      if (state.localStream) {
        state.localStream.getTracks().forEach(t => t.stop());
      }

      const constraints = {
        video: videoDeviceId ? { deviceId: { exact: videoDeviceId }, width: { ideal: 1280 }, height: { ideal: 720 } } : { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: audioDeviceId ? { deviceId: { exact: audioDeviceId }, echoCancellation: true, noiseSuppression: true } : { echoCancellation: true, noiseSuppression: true }
      };

      state.localStream = await navigator.mediaDevices.getUserMedia(constraints);
      el.previewVideo.srcObject = state.localStream;
      el.localVideo.srcObject = state.localStream;

      updateCameraState(true);
      startMicVisualizer(state.localStream);
    } catch (err) {
      console.warn('[OmniCall] Media access error or permission denied:', err);
      updateCameraState(false);
      showToast('Camera/Mic permission: ' + (err.message || 'Permission denied'));
    }
  }

  function startMicVisualizer(stream) {
    try {
      if (!window.AudioContext && !window.webkitAudioContext) return;
      if (state.audioContext) state.audioContext.close();

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      state.audioContext = new AudioCtx();
      const source = state.audioContext.createMediaStreamSource(stream);
      state.analyser = state.audioContext.createAnalyser();
      state.analyser.fftSize = 64;
      source.connect(state.analyser);

      const dataArray = new Uint8Array(state.analyser.frequencyBinCount);

      function updateVolume() {
        if (!state.inCall && !el.lobbyMicFill) return;
        state.analyser.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const average = sum / dataArray.length;
        const percent = Math.min(100, Math.round((average / 128) * 100));

        if (el.lobbyMicFill) {
          el.lobbyMicFill.style.width = percent + '%';
        }

        // Active speaker indicator for local user
        if (state.inCall && el.localTile) {
          if (percent > 20 && !state.isMuted) {
            el.localTile.classList.add('speaking');
          } else {
            el.localTile.classList.remove('speaking');
          }
        }

        state.micLevelAnimationId = requestAnimationFrame(updateVolume);
      }

      updateVolume();
    } catch (e) {
      console.warn('AudioContext metering failed', e);
    }
  }

  async function enumerateDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();

      el.settingCameraSelect.innerHTML = '';
      el.settingMicSelect.innerHTML = '';
      el.settingSpeakerSelect.innerHTML = '';

      devices.forEach(device => {
        const option = document.createElement('option');
        option.value = device.deviceId;

        if (device.kind === 'videoinput') {
          option.text = device.label || `Camera ${el.settingCameraSelect.length + 1}`;
          el.settingCameraSelect.appendChild(option);
        } else if (device.kind === 'audioinput') {
          option.text = device.label || `Microphone ${el.settingMicSelect.length + 1}`;
          el.settingMicSelect.appendChild(option);
        } else if (device.kind === 'audiooutput') {
          option.text = device.label || `Speaker ${el.settingSpeakerSelect.length + 1}`;
          el.settingSpeakerSelect.appendChild(option);
        }
      });
    } catch (e) {
      console.warn('Error enumerating devices', e);
    }
  }

  // --- Join Meeting Workflow ---
  async function joinMeeting() {
    const room = el.inputRoom.value.trim().toLowerCase();
    const name = el.inputName.value.trim();

    if (!room) {
      showToast('Please enter a room name');
      return;
    }
    if (!name) {
      showToast('Please enter your display name');
      return;
    }

    state.roomName = room;
    state.userName = name;
    localStorage.setItem('omnicall_user_name', name);

    el.callRoomName.textContent = room;
    el.localNameTag.textContent = `${name} (You)`;
    el.localAvatarText.textContent = name.charAt(0).toUpperCase();

    // Ensure camera & avatar state are synchronized
    updateCameraState(!state.isVideoOff && !!state.localStream && state.localStream.getVideoTracks().length > 0);

    // Switch view to in-call screen
    el.lobbyView.classList.add('hidden');
    el.callView.classList.remove('hidden');
    state.inCall = true;

    // Start unlimited call duration timer
    startCallTimer();

    // Initialize Calling Engine
    if (state.engineType === 'livekit') {
      await connectLiveKitSFU();
    } else {
      await connectWebRTCMesh();
    }

    updateGridCount();
    showToast(`Joined Room ${room} • Unlimited Call Active`);
  }

  // --- Connect LiveKit SFU Engine ---
  async function connectLiveKitSFU() {
    el.callEngineBadge.textContent = 'LiveKit SFU (10+ Users)';
    el.statEngine.textContent = 'LiveKit Enterprise SFU';

    try {
      const serverTarget = getServerTarget();
      let livekitWs = 'ws://129.225.108.83:7880';
      try {
        const u = new URL(serverTarget);
        if (u.protocol === 'https:') {
          livekitWs = `wss://${u.host}/rtc`;
        } else {
          livekitWs = `ws://${u.hostname}:7880`;
        }
      } catch (e) {
        livekitWs = state.serverConfig.livekitUrl || 'ws://localhost:7880';
      }

      state.engine = new LiveKitSFUEngine({
        roomName: state.roomName,
        userName: state.userName,
        apiHost: serverTarget,
        livekitUrl: livekitWs
      });

      // Events
      state.engine.on('track-subscribed', ({ track, participant, stream }) => {
        addRemoteParticipantTrack(participant.identity, participant.name || participant.identity, track, stream);
      });

      state.engine.on('track-unsubscribed', ({ track, participant }) => {
        // Track removed
      });

      state.engine.on('peer-connected', ({ peerId, name }) => {
        ensureRemoteParticipantTile(peerId, name);
        updateParticipantsList();
      });

      state.engine.on('peer-disconnected', (peerId) => {
        removeRemoteParticipant(peerId);
        updateParticipantsList();
      });

      state.engine.on('active-speakers', (speakerIds) => {
        highlightActiveSpeakers(speakerIds);
      });

      state.engine.on('chat-message', (data) => {
        appendChatMessage(data.senderName, data.text, false);
      });

      state.engine.on('file-received', (data) => {
        appendFileDownload(data.senderName, data.fileName, data.fileSize, data.blob);
      });

      await state.engine.connect(state.localStream);
      showToast('Connected to LiveKit SFU Server');
    } catch (err) {
      console.error('[LiveKit] Connection failed, falling back to P2P Mesh engine:', err);
      showToast('LiveKit SFU offline. Auto-switching to Built-in P2P Mesh Engine...');
      state.engineType = 'mesh';
      await connectWebRTCMesh();
    }
  }

  // --- Connect Built-in WebRTC Mesh Engine ---
  async function connectWebRTCMesh() {
    el.callEngineBadge.textContent = 'Built-in P2P Mesh';
    el.statEngine.textContent = 'Direct WebRTC Mesh';

    try {
      state.engine = new WebRTCMeshEngine({
        roomName: state.roomName,
        userName: state.userName,
        iceServers: state.serverConfig.iceServers
      });

      state.engine.on('peer-stream', ({ peerId, peerName, stream, track }) => {
        addRemoteParticipantStream(peerId, peerName, stream);
      });

      state.engine.on('peer-disconnected', (peerId) => {
        removeRemoteParticipant(peerId);
        updateParticipantsList();
      });

      state.engine.on('chat-message', (data) => {
        appendChatMessage(data.senderName, data.text, false);
      });

      state.engine.on('file-received', (data) => {
        appendFileDownload('Peer', data.fileName, data.fileSize, data.blob);
      });

      await state.engine.connect(state.localStream);
    } catch (err) {
      console.error('[Mesh] Connection failed:', err);
      showToast('Connection failed: ' + err.message);
    }
  }

  // --- Remote Video Tiles Management ---
  function ensureRemoteParticipantTile(peerId, peerName) {
    if (state.remotePeers.has(peerId)) {
      return state.remotePeers.get(peerId);
    }

    const tile = document.createElement('div');
    tile.className = 'video-tile';
    tile.id = `peer-tile-${peerId}`;

    const video = document.createElement('video');
    video.className = 'video-element';
    video.autoplay = true;
    video.playsInline = true;

    const audio = document.createElement('audio');
    audio.autoplay = true;

    const avatarPlaceholder = document.createElement('div');
    avatarPlaceholder.className = 'tile-avatar-placeholder';
    avatarPlaceholder.innerHTML = `
      <div class="avatar-circle">${(peerName || 'U').charAt(0).toUpperCase()}</div>
      <span>${peerName}</span>
    `;

    const overlay = document.createElement('div');
    overlay.className = 'video-tile-overlay';
    overlay.innerHTML = `
      <div class="tile-top-row">
        <span class="peer-name-tag">
          <span>${peerName}</span>
        </span>
      </div>
      <div class="tile-bottom-row"></div>
    `;

    tile.appendChild(video);
    tile.appendChild(audio);
    tile.appendChild(avatarPlaceholder);
    tile.appendChild(overlay);

    el.videoGrid.appendChild(tile);

    const peerData = {
      name: peerName,
      tileEl: tile,
      videoEl: video,
      audioEl: audio,
      avatarEl: avatarPlaceholder,
      stream: null
    };

    state.remotePeers.set(peerId, peerData);
    updateGridCount();
    updateParticipantsList();
    return peerData;
  }

  function addRemoteParticipantTrack(peerId, peerName, track, stream) {
    const peer = ensureRemoteParticipantTile(peerId, peerName);
    peer.stream = stream;

    if (track.kind === 'video') {
      peer.videoEl.srcObject = stream;
      peer.avatarEl.style.display = 'none';
      peer.videoEl.style.display = 'block';
    } else if (track.kind === 'audio') {
      peer.audioEl.srcObject = stream;
    }
  }

  function addRemoteParticipantStream(peerId, peerName, stream) {
    const peer = ensureRemoteParticipantTile(peerId, peerName);
    peer.stream = stream;
    peer.videoEl.srcObject = stream;
    peer.audioEl.srcObject = stream;

    const hasVideo = stream.getVideoTracks().length > 0;
    peer.avatarEl.style.display = hasVideo ? 'none' : 'flex';
  }

  function removeRemoteParticipant(peerId) {
    const peer = state.remotePeers.get(peerId);
    if (peer) {
      if (peer.tileEl && peer.tileEl.parentNode) {
        peer.tileEl.parentNode.removeChild(peer.tileEl);
      }
      state.remotePeers.delete(peerId);
      updateGridCount();
      updateParticipantsList();
    }
  }

  function updateGridCount() {
    const totalCount = 1 + state.remotePeers.size; // 1 local + remotes
    el.videoGrid.setAttribute('data-count', Math.min(12, totalCount).toString());
    el.participantsCount.textContent = totalCount.toString();
  }

  function highlightActiveSpeakers(speakerIds) {
    // Remote speaker outlines
    state.remotePeers.forEach((peer, peerId) => {
      if (speakerIds.includes(peerId)) {
        peer.tileEl.classList.add('speaking');
      } else {
        peer.tileEl.classList.remove('speaking');
      }
    });
  }

  // --- Call Duration Timer ---
  function startCallTimer() {
    state.callStartTime = Date.now();
    if (state.timerInterval) clearInterval(state.timerInterval);

    state.timerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - state.callStartTime) / 1000);
      const hours = Math.floor(elapsed / 3600).toString().padStart(2, '0');
      const mins = Math.floor((elapsed % 3600) / 60).toString().padStart(2, '0');
      const secs = (elapsed % 60).toString().padStart(2, '0');
      el.callDurationTimer.textContent = `${hours}:${mins}:${secs}`;
    }, 1000);
  }

  // --- Audio / Video Control Toggles ---
  function toggleMicrophone() {
    state.isMuted = !state.isMuted;

    if (state.localStream) {
      state.localStream.getAudioTracks().forEach(t => t.enabled = !state.isMuted);
    }

    if (state.engine) {
      if (state.engine.setMicrophoneEnabled) {
        state.engine.setMicrophoneEnabled(!state.isMuted);
      }
    }

    // UI Updates
    if (state.isMuted) {
      el.ctrlMic.classList.add('muted');
      el.lobbyBtnMic.classList.add('muted');
      showToast('Microphone Muted');
    } else {
      el.ctrlMic.classList.remove('muted');
      el.lobbyBtnMic.classList.remove('muted');
      showToast('Microphone Active');
    }
  }

  function toggleCamera() {
    state.isVideoOff = !state.isVideoOff;

    if (state.localStream) {
      state.localStream.getVideoTracks().forEach(t => t.enabled = !state.isVideoOff);
    }

    if (state.engine) {
      if (state.engine.setCameraEnabled) {
        state.engine.setCameraEnabled(!state.isVideoOff);
      }
    }

    // UI Updates
    if (state.isVideoOff) {
      el.ctrlCam.classList.add('off');
      el.lobbyBtnCamera.classList.add('off');
      el.localAvatar.style.display = 'flex';
      el.previewCameraOff.style.display = 'flex';
      showToast('Camera Turned Off');
    } else {
      el.ctrlCam.classList.remove('off');
      el.lobbyBtnCamera.classList.remove('off');
      el.localAvatar.style.display = 'none';
      el.previewCameraOff.style.display = 'none';
      showToast('Camera Active');
    }
  }

  // --- Screen Sharing ---
  async function toggleScreenShare() {
    if (state.isScreenSharing) {
      stopScreenShare();
      return;
    }

    try {
      if (window.electronAPI && window.electronAPI.isElectron) {
        // Electron Desktop: Show visual window and screen selector
        const sources = await window.electronAPI.getScreenSources();
        renderScreenSourcesModal(sources);
      } else {
        // Browser fallback: getDisplayMedia
        const displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: { cursor: 'always' },
          audio: true
        });
        handleScreenShareStream(displayStream);
      }
    } catch (err) {
      console.warn('Screen share cancelled or failed:', err);
    }
  }

  function renderScreenSourcesModal(sources) {
    el.screenshareSourcesGrid.innerHTML = '';
    sources.forEach(source => {
      const item = document.createElement('div');
      item.className = 'source-item';
      item.innerHTML = `
        <img class="source-thumb" src="${source.thumbnail}" alt="${source.name}">
        <div class="source-name">${source.name}</div>
      `;
      item.addEventListener('click', async () => {
        closeModal(el.modalScreenshare);
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
              mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: source.id,
                minWidth: 1280,
                maxWidth: 1920,
                minHeight: 720,
                maxHeight: 1080
              }
            }
          });
          handleScreenShareStream(stream);
        } catch (e) {
          showToast('Could not share selected window: ' + e.message);
        }
      });
      el.screenshareSourcesGrid.appendChild(item);
    });
    openModal(el.modalScreenshare);
  }

  async function handleScreenShareStream(stream) {
    state.screenStream = stream;
    state.isScreenSharing = true;
    el.ctrlScreen.classList.add('active');

    // Display locally on the screen share stage
    el.screenShareVideo.srcObject = stream;
    el.screenShareStage.classList.add('active');

    const screenTrack = stream.getVideoTracks()[0];

    // Publish to engine
    if (state.engine) {
      if (state.engine.startScreenShare) {
        await state.engine.startScreenShare(screenTrack);
      } else if (state.engine.replaceTrack) {
        state.engine.replaceTrack(screenTrack, 'video');
      }
    }

    screenTrack.onended = () => {
      stopScreenShare();
    };

    showToast('Screen Sharing Active');
  }

  async function stopScreenShare() {
    if (!state.isScreenSharing) return;

    if (state.screenStream) {
      state.screenStream.getTracks().forEach(t => t.stop());
      state.screenStream = null;
    }

    el.screenShareStage.classList.remove('active');
    el.screenShareVideo.srcObject = null;
    el.ctrlScreen.classList.remove('active');
    state.isScreenSharing = false;

    // Restore camera video track
    const camTrack = state.localStream ? state.localStream.getVideoTracks()[0] : null;
    if (state.engine) {
      if (state.engine.stopScreenShare) {
        await state.engine.stopScreenShare();
      } else if (state.engine.replaceTrack && camTrack) {
        state.engine.replaceTrack(camTrack, 'video');
      }
    }

    showToast('Screen Sharing Stopped');
  }

  // --- Chat & File Transfers ---
  function sendChatMessage() {
    const text = el.chatTextInput.value.trim();
    if (!text) return;

    if (state.engine) {
      state.engine.sendChat(text);
    }

    appendChatMessage('You', text, true);
    el.chatTextInput.value = '';
  }

  function appendChatMessage(senderName, text, isMine) {
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${isMine ? 'mine' : 'theirs'}`;

    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    bubble.innerHTML = `
      <div class="chat-sender">
        <span class="chat-sender-name">${senderName}</span>
        <span>${timeStr}</span>
      </div>
      <div class="chat-text">${escapeHtml(text)}</div>
    `;

    el.chatMessagesContainer.appendChild(bubble);
    el.chatMessagesContainer.scrollTop = el.chatMessagesContainer.scrollHeight;

    if (!isMine && el.sidebarDrawer.classList.contains('closed')) {
      state.unreadMessages++;
      el.chatBadge.textContent = state.unreadMessages;
      el.chatBadge.style.display = 'flex';
    }
  }

  function sendP2PFile(file) {
    if (!file) return;
    if (!state.engine) return;

    showToast(`Sending ${file.name} directly via P2P...`);
    state.engine.sendFile(file);

    appendFileDownload('You', file.name, file.size, file);
  }

  function appendFileDownload(senderName, fileName, fileSize, blobOrFile) {
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble theirs`;

    const sizeStr = formatBytes(fileSize);
    const downloadUrl = URL.createObjectURL(blobOrFile);

    bubble.innerHTML = `
      <div class="chat-sender">
        <span class="chat-sender-name">${senderName}</span>
        <span>Shared a file</span>
      </div>
      <div class="file-card">
        <div class="file-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
          </svg>
        </div>
        <div class="file-details">
          <div class="file-name">${escapeHtml(fileName)}</div>
          <div class="file-size">${sizeStr} • Direct P2P Transfer</div>
        </div>
        <a href="${downloadUrl}" download="${escapeHtml(fileName)}" class="file-download-btn">Save</a>
      </div>
    `;

    el.chatMessagesContainer.appendChild(bubble);
    el.chatMessagesContainer.scrollTop = el.chatMessagesContainer.scrollHeight;
  }

  function updateParticipantsList() {
    el.participantsListContainer.innerHTML = '';

    // Local user
    const localItem = document.createElement('div');
    localItem.className = 'participant-item';
    localItem.innerHTML = `
      <div class="participant-info">
        <div class="participant-avatar-mini">${state.userName.charAt(0).toUpperCase()}</div>
        <span class="participant-name-text">${state.userName} (You)</span>
      </div>
      <span style="font-size: 11px; color: var(--accent-emerald);">Host</span>
    `;
    el.participantsListContainer.appendChild(localItem);

    // Remote users
    state.remotePeers.forEach((peer, peerId) => {
      const item = document.createElement('div');
      item.className = 'participant-item';
      item.innerHTML = `
        <div class="participant-info">
          <div class="participant-avatar-mini">${peer.name.charAt(0).toUpperCase()}</div>
          <span class="participant-name-text">${peer.name}</span>
        </div>
        <span style="font-size: 11px; color: var(--text-muted);">Connected</span>
      `;
      el.participantsListContainer.appendChild(item);
    });
  }

  // --- End Call ---
  function leaveCall() {
    if (state.timerInterval) clearInterval(state.timerInterval);
    if (state.engine) {
      state.engine.disconnect();
      state.engine = null;
    }
    stopScreenShare();

    // Clean remote tiles
    state.remotePeers.forEach(peer => {
      if (peer.tileEl && peer.tileEl.parentNode) {
        peer.tileEl.parentNode.removeChild(peer.tileEl);
      }
    });
    state.remotePeers.clear();

    state.inCall = false;
    el.callView.classList.add('hidden');
    el.lobbyView.classList.remove('hidden');

    showToast('Call Ended');
  }

  // --- Utility Functions ---
  function copyMeetingLink() {
    const room = state.roomName || el.inputRoom.value.trim().toLowerCase();

    // Determine the publicly accessible server base URL
    let serverBase = (el.settingServerUrl && el.settingServerUrl.value.trim()) || '';
    if (!serverBase || serverBase.includes('localhost') || serverBase.startsWith('file:')) {
      if (state.serverConfig.livekitUrl && state.serverConfig.livekitUrl.includes('129.225.108.83')) {
        serverBase = 'https://129.225.108.83.sslip.io';
      } else if (/^\d+\.\d+\.\d+\.\d+$/.test(window.location.hostname)) {
        serverBase = `https://${window.location.hostname}.sslip.io`;
      } else {
        serverBase = window.location.origin;
      }
    }
    serverBase = serverBase.replace(/\/+$/, '');
    const link = `${serverBase}/?room=${encodeURIComponent(room)}`;

    // 1. Electron Native Clipboard API (never blocked by browser security)
    if (window.electronAPI && window.electronAPI.copyToClipboard) {
      window.electronAPI.copyToClipboard(link);
      showToast('Meeting link copied! Send to guest: ' + link);
      return;
    }

    // 2. Standard Browser Clipboard API
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(link).then(() => {
        showToast('Meeting link copied! Send to guest: ' + link);
      }).catch(() => {
        fallbackCopyText(link);
      });
    } else {
      fallbackCopyText(link);
    }
  }

  function fallbackCopyText(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    try {
      document.execCommand('copy');
      showToast('Meeting link copied! Send to guest.');
    } catch (e) {
      prompt('Copy this link and send to your guest:', text);
    }
    document.body.removeChild(textarea);
  }

  function openModal(modal) {
    modal.classList.add('open');
  }

  function closeModal(modal) {
    modal.classList.remove('open');
  }

  function showToast(message) {
    el.toastHud.textContent = message;
    el.toastHud.classList.add('show');
    setTimeout(() => {
      el.toastHud.classList.remove('show');
    }, 3200);
  }

  function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // --- Event Listeners Wire-up ---
  function attachEventListeners() {
    // Lobby
    el.lobbyBtnMic.addEventListener('click', toggleMicrophone);
    el.lobbyBtnCamera.addEventListener('click', toggleCamera);
    el.btnJoinRoom.addEventListener('click', joinMeeting);
    el.btnCopyCallLink.addEventListener('click', copyMeetingLink);

    // Call Controls
    el.ctrlMic.addEventListener('click', toggleMicrophone);
    el.ctrlCam.addEventListener('click', toggleCamera);
    el.ctrlScreen.addEventListener('click', toggleScreenShare);
    el.ctrlLeave.addEventListener('click', leaveCall);

    // Keyboard Spacebar for Push-to-Talk / Mute
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && state.inCall && document.activeElement.tagName !== 'INPUT') {
        e.preventDefault();
        toggleMicrophone();
      }
    });

    // Chat
    el.ctrlChat.addEventListener('click', () => {
      el.sidebarDrawer.classList.toggle('closed');
      state.unreadMessages = 0;
      el.chatBadge.style.display = 'none';
      el.tabBtnChat.click();
    });

    el.ctrlParticipants.addEventListener('click', () => {
      el.sidebarDrawer.classList.toggle('closed');
      el.tabBtnParticipants.click();
    });

    el.tabBtnChat.addEventListener('click', () => {
      el.tabBtnChat.classList.add('active');
      el.tabBtnParticipants.classList.remove('active');
      el.tabContentChat.style.display = 'flex';
      el.tabContentParticipants.style.display = 'none';
    });

    el.tabBtnParticipants.addEventListener('click', () => {
      el.tabBtnParticipants.classList.add('active');
      el.tabBtnChat.classList.remove('active');
      el.tabContentChat.style.display = 'none';
      el.tabContentParticipants.style.display = 'flex';
    });

    el.btnSendChat.addEventListener('click', sendChatMessage);
    el.chatTextInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') sendChatMessage();
    });

    // File transfer
    el.btnAttachFile.addEventListener('click', () => el.fileInput.click());
    el.fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        sendP2PFile(e.target.files[0]);
        e.target.value = '';
      }
    });

    // Fullscreen
    el.ctrlFullscreen.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
      } else {
        document.exitFullscreen();
      }
    });

    // Modals
    el.ctrlSettings.addEventListener('click', () => openModal(el.modalSettings));
    el.closeSettingsModal.addEventListener('click', () => closeModal(el.modalSettings));
    el.closeScreenshareModal.addEventListener('click', () => closeModal(el.modalScreenshare));
    el.btnStatsHud.addEventListener('click', () => openModal(el.modalStats));
    el.closeStatsModal.addEventListener('click', () => closeModal(el.modalStats));

    // Chrome Flag Help Modal & Insecure Origin Banner
    if (el.btnShowChromeFlagHelp) {
      el.btnShowChromeFlagHelp.addEventListener('click', () => openModal(el.modalChromeFlag));
    }
    if (el.closeChromeFlagModal) {
      el.closeChromeFlagModal.addEventListener('click', () => closeModal(el.modalChromeFlag));
    }
    if (el.btnCloseBanner) {
      el.btnCloseBanner.addEventListener('click', () => {
        if (el.secureContextBanner) el.secureContextBanner.style.display = 'none';
      });
    }

    el.saveSettingsBtn.addEventListener('click', async () => {
      closeModal(el.modalSettings);
      const camId = el.settingCameraSelect.value;
      const micId = el.settingMicSelect.value;
      const newTarget = el.settingServerUrl.value.trim().replace(/\/+$/, '');
      if (newTarget) {
        localStorage.setItem('omnicall_server_target', newTarget);
        await fetchServerConfig();
      }

      // Save auto-join preferences
      if (el.settingAutoJoinEnable) {
        const isAuto = el.settingAutoJoinEnable.checked;
        localStorage.setItem('omnicall_auto_join', isAuto ? 'true' : 'false');
      }
      if (el.settingAutoJoinRoom) {
        localStorage.setItem('omnicall_auto_room', el.settingAutoJoinRoom.value.trim().toLowerCase());
      }
      if (window.electronAPI && window.electronAPI.setAutoStart && el.settingAutoStartWindows) {
        try {
          await window.electronAPI.setAutoStart(el.settingAutoStartWindows.checked);
        } catch (e) {
          console.warn('Error setting Windows auto-start:', e);
        }
      }

      await initMediaPreview(camId, micId);
      showToast('Settings saved! Server: ' + (newTarget || 'Default'));
    });
  }

  // --- Auto-Join & Persistent Configuration ---
  async function setupAutoJoinSettings() {
    const isAutoJoin = localStorage.getItem('omnicall_auto_join') === 'true';
    const autoRoom = localStorage.getItem('omnicall_auto_room') || '';

    if (el.settingAutoJoinEnable) {
      el.settingAutoJoinEnable.checked = isAutoJoin;
      if (el.autoJoinRoomGroup) {
        el.autoJoinRoomGroup.style.display = isAutoJoin ? 'block' : 'none';
      }
      el.settingAutoJoinEnable.addEventListener('change', () => {
        if (el.autoJoinRoomGroup) {
          el.autoJoinRoomGroup.style.display = el.settingAutoJoinEnable.checked ? 'block' : 'none';
        }
      });
    }

    if (el.settingAutoJoinRoom) {
      el.settingAutoJoinRoom.value = autoRoom;
    }

    // Windows startup checkbox if in Electron
    if (window.electronAPI && window.electronAPI.getAutoStart && el.autoStartWindowsGroup) {
      el.autoStartWindowsGroup.style.display = 'block';
      try {
        const autoStartEnabled = await window.electronAPI.getAutoStart();
        if (el.settingAutoStartWindows) {
          el.settingAutoStartWindows.checked = Boolean(autoStartEnabled);
        }
      } catch (e) {
        console.warn('Error reading auto-start setting:', e);
      }
    }
  }

  async function checkAutoJoin() {
    // 1. Check URL query parameters (passed from CLI or omnicall:// deep-link)
    const urlParams = new URLSearchParams(window.location.search);
    const autojoinUrl = urlParams.get('autojoin') === 'true' || urlParams.get('autojoin') === '1';
    const roomUrl = urlParams.get('room');
    const nameUrl = urlParams.get('name');

    if (nameUrl) {
      el.inputName.value = nameUrl;
      state.userName = nameUrl;
    }
    if (roomUrl) {
      el.inputRoom.value = roomUrl.toLowerCase().trim();
      state.roomName = roomUrl.toLowerCase().trim();
    }

    // 2. Check Launch Args from Electron IPC
    if (window.electronAPI && window.electronAPI.getLaunchArgs) {
      try {
        const args = await window.electronAPI.getLaunchArgs();
        if (args) {
          if (args.room && !roomUrl) {
            el.inputRoom.value = args.room.toLowerCase().trim();
            state.roomName = args.room.toLowerCase().trim();
          }
          if (args.name && !nameUrl) {
            el.inputName.value = args.name;
            state.userName = args.name;
          }
          if (args.autojoin) {
            triggerJoinWithMedia();
            return;
          }
        }
      } catch (e) {
        console.warn('Error reading Electron launch args:', e);
      }
    }

    // 3. Check persistent user setting from localStorage
    const savedAutoJoin = localStorage.getItem('omnicall_auto_join') === 'true';
    const savedAutoRoom = localStorage.getItem('omnicall_auto_room');

    if (autojoinUrl && el.inputRoom.value.trim()) {
      triggerJoinWithMedia();
    } else if (savedAutoJoin && savedAutoRoom) {
      el.inputRoom.value = savedAutoRoom;
      triggerJoinWithMedia();
    }

    // 4. Handle deep link / secondary instance when app is already open
    if (window.electronAPI && window.electronAPI.onAutoJoinRoom) {
      window.electronAPI.onAutoJoinRoom((data) => {
        if (data.name) el.inputName.value = data.name;
        if (data.room) el.inputRoom.value = data.room;
        if (data.autojoin || !state.inCall) {
          triggerJoinWithMedia();
        }
      });
    }
  }

  function triggerJoinWithMedia() {
    showToast('Auto-joining conference with camera & microphone active...');
    setTimeout(async () => {
      // Ensure media stream is active
      if (!state.localStream) {
        await initMediaPreview();
      }
      joinMeeting();
    }, 600);
  }

  // Run on page load
  document.addEventListener('DOMContentLoaded', init);
})();
