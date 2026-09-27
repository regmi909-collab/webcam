/**
 * Vavantar • OmniCall - Application Controller
 * Handles UI state, hardware access (cameras/mics/screens), calling engines,
 * audio visualization, design themes, practice modes, stage spotlight,
 * floating reactions, and meeting workflows.
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
    },
    // Visual & UX Modes
    theme: 'emerald', // 'emerald', 'amber', 'cyber'
    sessionMode: 'conference', // 'conference', 'meditation', 'yoga', 'support'
    layoutMode: 'grid', // 'grid' or 'spotlight'
    spotlightPeerId: null // peerId currently in hero spotlight, or null for self/active
  };

  // --- DOM Elements ---
  const el = {
    // Window titlebar
    titlebar: document.getElementById('window-titlebar'),
    winMin: document.getElementById('win-min-btn'),
    winMax: document.getElementById('win-max-btn'),
    winClose: document.getElementById('win-close-btn'),
    titlebarThemePills: document.querySelectorAll('#titlebar-theme-selector .theme-pill-btn'),

    // Views
    lobbyView: document.getElementById('lobby-view'),
    callView: document.getElementById('call-view'),

    // Lobby
    previewVideo: document.getElementById('preview-video'),
    previewCameraOff: document.getElementById('preview-camera-off'),
    lobbyBtnMic: document.getElementById('lobby-btn-mic'),
    lobbyBtnCamera: document.getElementById('lobby-btn-camera'),
    lobbyMicFill: document.getElementById('lobby-mic-fill'),
    previewStatusText: document.getElementById('preview-status-text'),
    quickCameraSelect: document.getElementById('quick-camera-select'),
    quickMicSelect: document.getElementById('quick-mic-select'),
    lobbyModePills: document.querySelectorAll('#lobby-mode-bar .mode-pill-btn'),
    lobbyModeDesc: document.getElementById('lobby-mode-desc'),
    themeCards: document.querySelectorAll('.design-card[data-theme-card]'),
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
    callModePill: document.getElementById('call-mode-pill'),
    btnLayoutGrid: document.getElementById('btn-layout-grid'),
    btnLayoutSpotlight: document.getElementById('btn-layout-spotlight'),
    btnReactionsTopbar: document.getElementById('btn-reactions-topbar'),
    btnStatsHud: document.getElementById('btn-stats-hud'),

    // Stage & Layouts
    mainStageArea: document.getElementById('main-stage-area'),
    screenShareStage: document.getElementById('screen-share-stage'),
    screenShareVideo: document.getElementById('screen-share-video'),
    videoGrid: document.getElementById('video-grid'),
    localTile: document.getElementById('local-tile'),
    localVideo: document.getElementById('local-video'),
    localAvatar: document.getElementById('local-avatar'),
    localAvatarText: document.getElementById('local-avatar-text'),
    localNameTag: document.getElementById('local-name-tag'),
    localEqBars: document.getElementById('local-eq-bars'),

    // Spotlight Stage & Picture-in-Picture
    spotlightStage: document.getElementById('spotlight-stage'),
    spotlightHeroContainer: document.getElementById('spotlight-hero-container'),
    spotlightHeroVideo: document.getElementById('spotlight-hero-video'),
    spotlightHeroAvatar: document.getElementById('spotlight-hero-avatar'),
    spotlightHeroAvatarText: document.getElementById('spotlight-hero-avatar-text'),
    spotlightLabel: document.getElementById('spotlight-label'),
    spotlightTitle: document.getElementById('spotlight-title'),
    spotlightMeta: document.getElementById('spotlight-meta'),
    ownPipTile: document.getElementById('own-pip-tile'),
    pipSelfVideo: document.getElementById('pip-self-video'),
    pipSelfAvatar: document.getElementById('pip-self-avatar'),
    pipSelfAvatarText: document.getElementById('pip-self-avatar-text'),
    pipSelfLabel: document.getElementById('pip-self-label'),

    // Floating Reactions
    floatingReactionsLayer: document.getElementById('floating-reactions-layer'),
    reactionsPopover: document.getElementById('reactions-popover'),
    reactionEmojiBtns: document.querySelectorAll('.reaction-emoji-btn'),

    // Sidebar & Drawer
    sidebarDrawer: document.getElementById('sidebar-drawer'),
    sessionInfoCard: document.getElementById('session-info-card'),
    sessionTitle: document.getElementById('sessionTitle'),
    sessionDesc: document.getElementById('sessionDesc'),
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
    ctrlMicLabel: document.getElementById('ctrl-mic-label'),
    ctrlCam: document.getElementById('ctrl-cam'),
    ctrlScreen: document.getElementById('ctrl-screen'),
    ctrlLayout: document.getElementById('ctrl-layout'),
    ctrlReactions: document.getElementById('ctrl-reactions'),
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
    modalThemeEmerald: document.getElementById('modal-theme-emerald'),
    modalThemeAmber: document.getElementById('modal-theme-amber'),
    modalThemeCyber: document.getElementById('modal-theme-cyber'),
    settingCameraSelect: document.getElementById('setting-camera-select'),
    settingMicSelect: document.getElementById('setting-mic-select'),
    settingSpeakerSelect: document.getElementById('setting-speaker-select'),
    settingResolutionSelect: document.getElementById('setting-resolution-select'),
    settingServerUrl: document.getElementById('setting-server-url'),

    // Auto-Join & Windows Startup
    settingAutoJoinEnable: document.getElementById('setting-auto-join-enable'),
    settingAutoJoinRoom: document.getElementById('setting-auto-join-room'),
    autoJoinRoomGroup: document.getElementById('auto-join-room-group'),
    settingAutoStartWindows: document.getElementById('setting-auto-start-windows'),
    autoStartWindowsGroup: document.getElementById('auto-start-windows-group'),

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
    flagGuideOrigin: document.getElementById('flag-guide-origin')
  };

  // --- Practice & Session Mode Presets ---
  const modePresets = {
    conference: {
      label: '◉ General Meeting',
      title: 'Conference Room',
      desc: 'All participants connected • Enterprise WebRTC SFU • 0 caps',
      spotlightTitle: 'Collaborative Video Call',
      spotlightMeta: 'Interactive group conference'
    },
    meditation: {
      label: '◉ Quiet Practice',
      title: 'Evening Reset',
      desc: 'A gentle guided meditation · 25 min • Room is private and encrypted',
      spotlightTitle: 'A quiet place to begin',
      spotlightMeta: 'Guiding the session with calm audio'
    },
    yoga: {
      label: '⌁ Live Yoga Class',
      title: 'Flow Together',
      desc: 'All levels studio flow · 45 min • Instructor spotlight active',
      spotlightTitle: 'Move at your own pace',
      spotlightMeta: 'Leading today\'s studio practice'
    },
    support: {
      label: '▧ Remote Support',
      title: 'Remote Support Session',
      desc: 'Screen sharing and diagnostic tools active • P2P data channels ready',
      spotlightTitle: 'Shared Screen & Support View',
      spotlightMeta: 'Remote desktop assistance session'
    }
  };

  // --- Initializer ---
  async function init() {
    setupElectronWindow();
    initTheme();
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

  // --- Theme Management (Chosen in Settings) ---
  function initTheme() {
    const savedTheme = localStorage.getItem('omnicall_theme') || localStorage.getItem('vavantar_theme') || 'emerald';
    applyTheme(savedTheme, false);
  }

  function applyTheme(themeName, notify = true) {
    if (!['emerald', 'amber', 'cyber'].includes(themeName)) themeName = 'emerald';
    state.theme = themeName;
    document.body.setAttribute('data-theme', themeName);
    localStorage.setItem('omnicall_theme', themeName);

    // Update active button state in Settings modal
    const themeChoiceBtns = document.querySelectorAll('.theme-choice-btn');
    if (themeChoiceBtns) {
      themeChoiceBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.theme === themeName);
      });
    }

    if (notify) {
      const names = { emerald: 'Quiet Sanctuary', amber: 'Sunlit Studio', cyber: 'Focus Room' };
      showToast(`Applied ${names[themeName] || themeName} theme`);
    }
  }

  // --- Session Mode Management ---
  function setSessionMode(mode) {
    if (!modePresets[mode]) mode = 'conference';
    state.sessionMode = mode;
    const preset = modePresets[mode];

    if (el.lobbyModePills) {
      el.lobbyModePills.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
      });
    }

    if (el.callModePill) el.callModePill.textContent = preset.label;
    if (el.sessionTitle) el.sessionTitle.textContent = preset.title;
    if (el.sessionDesc) el.sessionDesc.textContent = preset.desc;
    if (el.lobbyModeDesc) el.lobbyModeDesc.textContent = preset.desc;
    if (el.spotlightTitle && !state.spotlightPeerId) el.spotlightTitle.textContent = preset.spotlightTitle;
    if (el.spotlightMeta && !state.spotlightPeerId) el.spotlightMeta.textContent = preset.spotlightMeta;

    if (mode === 'yoga' || mode === 'support') {
      setLayoutMode('spotlight');
    }
  }

  // --- Stage Layout Management (Grid vs Spotlight) ---
  function setLayoutMode(mode) {
    state.layoutMode = mode;

    if (mode === 'grid') {
      if (el.videoGrid) el.videoGrid.classList.remove('hidden');
      if (el.spotlightStage) el.spotlightStage.classList.add('hidden');
      if (el.btnLayoutGrid) el.btnLayoutGrid.classList.add('active');
      if (el.btnLayoutSpotlight) el.btnLayoutSpotlight.classList.remove('active');
    } else {
      if (el.videoGrid) el.videoGrid.classList.add('hidden');
      if (el.spotlightStage) el.spotlightStage.classList.remove('hidden');
      if (el.btnLayoutGrid) el.btnLayoutGrid.classList.remove('active');
      if (el.btnLayoutSpotlight) el.btnLayoutSpotlight.classList.add('active');
      updateSpotlightView();
    }
  }

  function toggleLayoutMode() {
    setLayoutMode(state.layoutMode === 'grid' ? 'spotlight' : 'grid');
  }

  function updateSpotlightView() {
    // 1. Sync local user into PiP self tile
    if (state.localStream && el.pipSelfVideo) {
      el.pipSelfVideo.srcObject = state.localStream;
      if (el.pipSelfAvatar) el.pipSelfAvatar.style.display = state.isVideoOff ? 'flex' : 'none';
      if (el.pipSelfVideo) el.pipSelfVideo.style.display = state.isVideoOff ? 'none' : 'block';
    }
    if (el.pipSelfLabel) {
      el.pipSelfLabel.textContent = `${state.userName || 'You'} · Local`;
    }

    // 2. Select Spotlight Target Stream
    let targetStream = null;
    let targetName = state.userName || 'You';
    let isSelf = false;

    if (state.spotlightPeerId && state.remotePeers.has(state.spotlightPeerId)) {
      const peer = state.remotePeers.get(state.spotlightPeerId);
      targetStream = peer.stream;
      targetName = peer.name || 'Remote Participant';
    } else if (state.remotePeers.size > 0) {
      const firstPeer = state.remotePeers.values().next().value;
      targetStream = firstPeer.stream;
      targetName = firstPeer.name;
    } else {
      targetStream = state.localStream;
      targetName = `${state.userName || 'You'} (Self)`;
      isSelf = true;
    }

    if (targetStream && el.spotlightHeroVideo) {
      el.spotlightHeroVideo.srcObject = targetStream;
      const hasVideo = targetStream.getVideoTracks().length > 0 && targetStream.getVideoTracks()[0].enabled;
      if (el.spotlightHeroAvatar) el.spotlightHeroAvatar.style.display = hasVideo ? 'none' : 'flex';
      if (el.spotlightHeroVideo) el.spotlightHeroVideo.style.display = hasVideo ? 'block' : 'none';
    }

    if (el.spotlightHeroAvatarText) {
      el.spotlightHeroAvatarText.textContent = (targetName || 'U').charAt(0).toUpperCase();
    }
    if (el.spotlightLabel) {
      el.spotlightLabel.textContent = isSelf ? 'HOST · MAIN VIEW' : 'SPEAKER · SPOTLIGHT VIEW';
    }
    if (el.spotlightTitle) {
      el.spotlightTitle.textContent = targetName;
    }
    if (el.spotlightMeta) {
      const preset = modePresets[state.sessionMode] || modePresets.conference;
      el.spotlightMeta.textContent = isSelf ? preset.spotlightMeta : `${targetName} is speaking · Click to switch view`;
    }
  }

  function focusParticipant(peerId) {
    state.spotlightPeerId = peerId;
    setLayoutMode('spotlight');
    updateSpotlightView();
    updateParticipantsList();
  }

  // --- Floating Emoji Reactions ---
  function spawnFloatingReaction(emoji) {
    if (!el.floatingReactionsLayer) return;
    const item = document.createElement('div');
    item.className = 'floating-reaction-item';
    item.textContent = emoji;

    // Randomize horizontal trajectory across screen
    const randomLeft = 20 + Math.random() * 60;
    item.style.left = `${randomLeft}%`;

    el.floatingReactionsLayer.appendChild(item);

    setTimeout(() => {
      if (item.parentNode) item.parentNode.removeChild(item);
    }, 2400);
  }

  function sendReaction(emoji) {
    spawnFloatingReaction(emoji);
    if (emoji === '✋') {
      showToast('You raised your hand');
    }

    // Broadcast reaction to remote callers via message protocol
    if (state.engine) {
      try {
        if (state.engine.sendChatMessage) {
          state.engine.sendChatMessage(`__REACTION__:${emoji}`);
        }
      } catch (e) {
        console.warn('Reaction send warning:', e);
      }
    }
  }

  // --- Electron Desktop Integration ---
  function setupElectronWindow() {
    if (window.electronAPI && window.electronAPI.isElectron) {
      el.winMin.addEventListener('click', () => window.electronAPI.minimize());
      el.winMax.addEventListener('click', () => window.electronAPI.maximize());
      el.winClose.addEventListener('click', () => window.electronAPI.close());
    } else {
      if (el.titlebar) {
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
      console.warn('[Vavantar] Server config fetch error:', e);
    }
  }

  // --- Lobby Setup ---
  function setupLobbyDefaults() {
    const randomAdjectives = ['quantum', 'stellar', 'hyper', 'apex', 'cyber', 'neon', 'pulse', 'ultra', 'infinite'];
    const randomNouns = ['falcon', 'summit', 'orbit', 'matrix', 'beacon', 'nexus', 'prism', 'vortex', 'echo'];
    const randomSlug = `${randomAdjectives[Math.floor(Math.random() * randomAdjectives.length)]}-${randomNouns[Math.floor(Math.random() * randomAdjectives.length)]}-${Math.floor(10 + Math.random() * 90)}`;

    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('room');

    el.inputRoom.value = roomParam ? roomParam.toLowerCase().trim() : randomSlug;

    const savedName = localStorage.getItem('omnicall_user_name');
    if (savedName) {
      el.inputName.value = savedName;
    } else {
      el.inputName.value = 'User_' + Math.floor(100 + Math.random() * 900);
    }

    el.btnRandomRoom.addEventListener('click', () => {
      const newSlug = `${randomAdjectives[Math.floor(Math.random() * randomAdjectives.length)]}-${randomNouns[Math.floor(Math.random() * randomAdjectives.length)]}-${Math.floor(10 + Math.random() * 90)}`;
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
      if (el.previewStatusText) el.previewStatusText.textContent = 'Audio & Video Ready';
    } else {
      if (el.localAvatar) el.localAvatar.style.display = 'flex';
      if (el.localVideo) el.localVideo.style.display = 'none';
      if (el.previewCameraOff) el.previewCameraOff.style.display = 'flex';
      if (el.previewVideo) el.previewVideo.style.display = 'none';
      if (el.ctrlCam) el.ctrlCam.classList.add('off');
      if (el.lobbyBtnCamera) el.lobbyBtnCamera.classList.add('off');
      if (el.previewStatusText) el.previewStatusText.textContent = 'Camera Off • Mic Active';
    }

    if (state.inCall && state.layoutMode === 'spotlight') {
      updateSpotlightView();
    }
  }

  // --- Media & Preview ---
  async function initMediaPreview(videoDeviceId = null, audioDeviceId = null) {
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const isElectron = window.electronAPI && window.electronAPI.isElectron;
    const isSecure = window.isSecureContext || isLocal || isElectron;

    if (!isSecure) {
      console.warn('[Vavantar] Insecure HTTP origin detected. Browser strictly requires HTTPS for camera/mic.');
      updateCameraState(false);
      checkSecureContext();
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.warn('[Vavantar] navigator.mediaDevices not available.');
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
      console.warn('[Vavantar] Media access error or permission denied:', err);
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

        // Active speaker indicators
        if (state.inCall) {
          const isSpeaking = percent > 15 && !state.isMuted;
          if (el.localTile) {
            el.localTile.classList.toggle('speaking', isSpeaking);
          }
          if (el.localEqBars) {
            el.localEqBars.classList.toggle('speaking', isSpeaking);
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
      if (el.quickCameraSelect) el.quickCameraSelect.innerHTML = '';
      if (el.quickMicSelect) el.quickMicSelect.innerHTML = '';

      devices.forEach(device => {
        const option = document.createElement('option');
        option.value = device.deviceId;

        if (device.kind === 'videoinput') {
          option.text = device.label || `Camera ${el.settingCameraSelect.length + 1}`;
          el.settingCameraSelect.appendChild(option);
          if (el.quickCameraSelect) el.quickCameraSelect.appendChild(option.cloneNode(true));
        } else if (device.kind === 'audioinput') {
          option.text = device.label || `Microphone ${el.settingMicSelect.length + 1}`;
          el.settingMicSelect.appendChild(option);
          if (el.quickMicSelect) el.quickMicSelect.appendChild(option.cloneNode(true));
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
    updateParticipantsList();
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

      state.engine.on('peer-connected', ({ peerId, name }) => {
        ensureRemoteParticipantTile(peerId, name);
        updateParticipantsList();
        showToast(`${name || 'Participant'} joined`);
      });

      state.engine.on('peer-disconnected', (peerId) => {
        removeRemoteParticipant(peerId);
        updateParticipantsList();
      });

      state.engine.on('active-speakers', (speakerIds) => {
        highlightActiveSpeakers(speakerIds);
      });

      state.engine.on('chat-message', (data) => {
        if (data.text && data.text.startsWith('__REACTION__:')) {
          const emoji = data.text.replace('__REACTION__:', '');
          spawnFloatingReaction(emoji);
          if (emoji === '✋') {
            showToast(`${data.senderName} raised their hand`);
          }
          return;
        }
        appendChatMessage(data.senderName, data.text, false);
      });

      state.engine.on('file-received', (data) => {
        appendFileDownload(data.senderName, data.fileName, data.fileSize, data.blob);
      });

      await state.engine.connect(state.localStream);
      showToast('Connected to LiveKit SFU Server');
    } catch (err) {
      console.error('[LiveKit] Connection failed, falling back to P2P Mesh engine:', err);
      showToast('LiveKit SFU offline. Auto-switching to P2P Mesh...');
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

      state.engine.on('peer-stream', ({ peerId, peerName, stream }) => {
        addRemoteParticipantStream(peerId, peerName, stream);
      });

      state.engine.on('peer-disconnected', (peerId) => {
        removeRemoteParticipant(peerId);
        updateParticipantsList();
      });

      state.engine.on('chat-message', (data) => {
        if (data.text && data.text.startsWith('__REACTION__:')) {
          const emoji = data.text.replace('__REACTION__:', '');
          spawnFloatingReaction(emoji);
          if (emoji === '✋') {
            showToast(`${data.senderName} raised their hand`);
          }
          return;
        }
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
          <span class="audio-equalizer-bars">
            <span class="eq-bar"></span>
            <span class="eq-bar"></span>
            <span class="eq-bar"></span>
          </span>
        </span>
      </div>
      <div class="tile-bottom-row"></div>
    `;

    tile.appendChild(video);
    tile.appendChild(audio);
    tile.appendChild(avatarPlaceholder);
    tile.appendChild(overlay);

    // Clicking tile switches to Spotlight focus
    tile.addEventListener('click', () => {
      focusParticipant(peerId);
    });

    el.videoGrid.appendChild(tile);

    const peerData = {
      id: peerId,
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
    if (state.layoutMode === 'spotlight') updateSpotlightView();
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

    if (state.layoutMode === 'spotlight') updateSpotlightView();
  }

  function addRemoteParticipantStream(peerId, peerName, stream) {
    const peer = ensureRemoteParticipantTile(peerId, peerName);
    peer.stream = stream;
    peer.videoEl.srcObject = stream;
    peer.audioEl.srcObject = stream;

    const hasVideo = stream.getVideoTracks().length > 0;
    peer.avatarEl.style.display = hasVideo ? 'none' : 'flex';
    if (state.layoutMode === 'spotlight') updateSpotlightView();
  }

  function removeRemoteParticipant(peerId) {
    const peer = state.remotePeers.get(peerId);
    if (peer) {
      if (peer.tileEl && peer.tileEl.parentNode) {
        peer.tileEl.parentNode.removeChild(peer.tileEl);
      }
      state.remotePeers.delete(peerId);
      if (state.spotlightPeerId === peerId) {
        state.spotlightPeerId = null;
      }
      updateGridCount();
      updateParticipantsList();
      if (state.layoutMode === 'spotlight') updateSpotlightView();
    }
  }

  function updateGridCount() {
    const totalCount = 1 + state.remotePeers.size;
    el.videoGrid.setAttribute('data-count', Math.min(12, totalCount).toString());
    el.participantsCount.textContent = totalCount.toString();
  }

  function highlightActiveSpeakers(speakerIds) {
    state.remotePeers.forEach((peer, peerId) => {
      const isSpeaking = speakerIds.includes(peerId);
      peer.tileEl.classList.toggle('speaking', isSpeaking);
      const eq = peer.tileEl.querySelector('.audio-equalizer-bars');
      if (eq) eq.classList.toggle('speaking', isSpeaking);
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

    if (state.engine && state.engine.setMicrophoneEnabled) {
      state.engine.setMicrophoneEnabled(!state.isMuted);
    }

    if (state.isMuted) {
      el.ctrlMic.classList.add('muted');
      el.lobbyBtnMic.classList.add('muted');
      if (el.ctrlMicLabel) el.ctrlMicLabel.textContent = 'Unmute';
      showToast('Microphone Muted');
    } else {
      el.ctrlMic.classList.remove('muted');
      el.lobbyBtnMic.classList.remove('muted');
      if (el.ctrlMicLabel) el.ctrlMicLabel.textContent = 'Mute';
      showToast('Microphone Active');
    }
  }

  function toggleCamera() {
    state.isVideoOff = !state.isVideoOff;

    if (state.localStream) {
      state.localStream.getVideoTracks().forEach(t => t.enabled = !state.isVideoOff);
    }

    if (state.engine && state.engine.setCameraEnabled) {
      state.engine.setCameraEnabled(!state.isVideoOff);
    }

    updateCameraState(!state.isVideoOff);
    showToast(state.isVideoOff ? 'Camera Turned Off' : 'Camera Active');
  }

  // --- Screen Sharing ---
  async function toggleScreenShare() {
    if (state.isScreenSharing) {
      stopScreenShare();
      return;
    }

    try {
      if (window.electronAPI && window.electronAPI.isElectron) {
        const sources = await window.electronAPI.getScreenSources();
        renderScreenShareSourcePicker(sources);
      } else {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: { cursor: 'always', frameRate: { ideal: 60 } },
          audio: true
        });
        handleScreenShareStream(stream);
      }
    } catch (err) {
      console.warn('Screen share cancelled or failed:', err);
    }
  }

  function renderScreenShareSourcePicker(sources) {
    el.screenshareSourcesGrid.innerHTML = '';

    sources.forEach(src => {
      const card = document.createElement('div');
      card.className = 'source-card';
      card.innerHTML = `
        <img class="source-thumb" src="${src.thumbnail}" alt="${src.name}">
        <span class="source-title">${src.name}</span>
      `;
      card.addEventListener('click', async () => {
        closeModal(el.modalScreenshare);
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
              mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: src.id,
                minWidth: 1280,
                maxWidth: 1920,
                maxHeight: 1080
              }
            }
          });
          handleScreenShareStream(stream);
        } catch (e) {
          showToast('Failed to capture selected screen: ' + e.message);
        }
      });
      el.screenshareSourcesGrid.appendChild(card);
    });

    openModal(el.modalScreenshare);
  }

  function handleScreenShareStream(stream) {
    state.screenStream = stream;
    state.isScreenSharing = true;
    el.ctrlScreen.classList.add('active');

    el.screenShareVideo.srcObject = stream;
    el.screenShareStage.classList.add('active');

    if (state.engine && state.engine.publishScreenShare) {
      state.engine.publishScreenShare(stream);
    }

    stream.getVideoTracks()[0].onended = () => {
      stopScreenShare();
    };

    showToast('Screen sharing started');
  }

  function stopScreenShare() {
    if (state.screenStream) {
      state.screenStream.getTracks().forEach(t => t.stop());
      state.screenStream = null;
    }
    state.isScreenSharing = false;
    el.ctrlScreen.classList.remove('active');
    el.screenShareStage.classList.remove('active');

    if (state.engine && state.engine.unpublishScreenShare) {
      state.engine.unpublishScreenShare();
    }

    showToast('Screen sharing stopped');
  }

  // --- Leave / End Call ---
  function leaveCall() {
    if (confirm('Are you sure you want to leave the call?')) {
      if (state.engine) {
        state.engine.disconnect();
        state.engine = null;
      }
      if (state.timerInterval) clearInterval(state.timerInterval);

      // Clean up remote tiles
      state.remotePeers.forEach(peer => {
        if (peer.tileEl && peer.tileEl.parentNode) {
          peer.tileEl.parentNode.removeChild(peer.tileEl);
        }
      });
      state.remotePeers.clear();

      stopScreenShare();

      // Reset to lobby
      state.inCall = false;
      el.callView.classList.add('hidden');
      el.lobbyView.classList.remove('hidden');
      updateGridCount();
      showToast('You left the meeting');
    }
  }

  // --- Chat Messaging ---
  function sendChatMessage() {
    const text = el.chatTextInput.value.trim();
    if (!text) return;

    appendChatMessage(state.userName || 'You', text, true);
    el.chatTextInput.value = '';

    if (state.engine && state.engine.sendChatMessage) {
      state.engine.sendChatMessage(text);
    }
  }

  function appendChatMessage(sender, text, isLocal) {
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${isLocal ? 'local' : 'remote'}`;
    bubble.innerHTML = `
      <span class="chat-sender">${escapeHtml(sender)}</span>
      <span class="chat-text">${escapeHtml(text)}</span>
    `;

    el.chatMessagesContainer.appendChild(bubble);
    el.chatMessagesContainer.scrollTop = el.chatMessagesContainer.scrollHeight;

    if (!isLocal && el.sidebarDrawer.classList.contains('closed')) {
      state.unreadMessages++;
      el.chatBadge.textContent = state.unreadMessages;
      el.chatBadge.style.display = 'grid';
    }
  }

  // --- P2P Direct File Transfer ---
  function sendP2PFile(file) {
    if (state.engine && state.engine.sendFile) {
      state.engine.sendFile(file);
      appendFileDownload(state.userName || 'You', file.name, file.size, null, true);
      showToast(`Sending ${file.name} directly via P2P...`);
    } else {
      showToast('File transfer requires active engine connection');
    }
  }

  function appendFileDownload(sender, fileName, fileSize, blob, isLocal = false) {
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${isLocal ? 'local' : 'remote'}`;

    let actionBtnHtml = '';
    if (blob) {
      const url = URL.createObjectURL(blob);
      actionBtnHtml = `<a class="file-download-btn" href="${url}" download="${escapeHtml(fileName)}">⬇ Save File</a>`;
    } else {
      actionBtnHtml = `<span style="font-size: 11px; opacity: 0.8;">(File sent)</span>`;
    }

    bubble.innerHTML = `
      <span class="chat-sender">${escapeHtml(sender)}</span>
      <div class="chat-file-bubble">
        <span class="file-name">📄 ${escapeHtml(fileName)}</span>
        <span class="file-meta">${formatBytes(fileSize)}</span>
        ${actionBtnHtml}
      </div>
    `;

    el.chatMessagesContainer.appendChild(bubble);
    el.chatMessagesContainer.scrollTop = el.chatMessagesContainer.scrollHeight;
  }

  // --- Participants List Rendering (Vavantar style) ---
  function updateParticipantsList() {
    el.participantsListContainer.innerHTML = '';

    // 1. Local user item
    const localItem = document.createElement('div');
    const isLocalSpotlight = state.spotlightPeerId === null || state.spotlightPeerId === 'local';
    localItem.className = `participant-item ${isLocalSpotlight ? 'selected' : ''}`;
    localItem.innerHTML = `
      <div class="participant-avatar">${(state.userName || 'Y').charAt(0).toUpperCase()}</div>
      <div class="participant-details">
        <div class="participant-name">${state.userName || 'You'} · you</div>
        <div class="participant-status">${state.isVideoOff ? 'Camera off' : 'Ready · camera on'}</div>
      </div>
      <span class="participant-badge">${isLocalSpotlight ? 'YOU (MAIN)' : 'YOU'}</span>
    `;
    localItem.addEventListener('click', () => {
      state.spotlightPeerId = null;
      updateSpotlightView();
      updateParticipantsList();
    });
    el.participantsListContainer.appendChild(localItem);

    // 2. Remote callers
    state.remotePeers.forEach((peer, peerId) => {
      const isSelected = state.spotlightPeerId === peerId;
      const item = document.createElement('div');
      item.className = `participant-item ${isSelected ? 'selected' : ''}`;
      item.innerHTML = `
        <div class="participant-avatar">${(peer.name || 'P').charAt(0).toUpperCase()}</div>
        <div class="participant-details">
          <div class="participant-name">${peer.name}</div>
          <div class="participant-status">${peer.stream ? 'Ready · video connected' : 'Connecting...'}</div>
        </div>
        <span class="participant-badge">${isSelected ? 'IN FOCUS' : 'CLICK TO FOCUS'}</span>
      `;
      item.addEventListener('click', () => {
        focusParticipant(peerId);
      });
      el.participantsListContainer.appendChild(item);
    });
  }

  // --- Copy Meeting Link Helpers ---
  function copyMeetingLink() {
    const room = state.roomName || el.inputRoom.value.trim().toLowerCase();
    if (!room) {
      showToast('Enter a room name first');
      return;
    }

    const host = window.location.hostname;
    let baseOrigin = window.location.origin;
    if (window.electronAPI || host === 'localhost' || host === '127.0.0.1') {
      baseOrigin = 'http://129.225.108.83';
    }

    const link = `${baseOrigin}/?room=${encodeURIComponent(room)}`;

    if (window.electronAPI && window.electronAPI.copyToClipboard) {
      window.electronAPI.copyToClipboard(link);
      showToast('Meeting link copied! Send to guests: ' + link);
      return;
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(link).then(() => {
        showToast('Meeting link copied! Send to guests: ' + link);
      }).catch(() => fallbackCopyText(link));
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
      prompt('Copy this link:', text);
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
    return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // --- Event Listeners Wire-up ---
  function attachEventListeners() {
    // Theme Switchers
    if (el.titlebarThemePills) {
      el.titlebarThemePills.forEach(pill => {
        pill.addEventListener('click', () => applyTheme(pill.dataset.setTheme));
      });
    }

    if (el.themeCards) {
      el.themeCards.forEach(card => {
        card.addEventListener('click', () => applyTheme(card.dataset.themeCard));
      });
    }

    if (el.modalThemeEmerald) el.modalThemeEmerald.addEventListener('click', () => applyTheme('emerald'));
    if (el.modalThemeAmber) el.modalThemeAmber.addEventListener('click', () => applyTheme('amber'));
    if (el.modalThemeCyber) el.modalThemeCyber.addEventListener('click', () => applyTheme('cyber'));

    // Mode Selector Pills
    if (el.lobbyModePills) {
      el.lobbyModePills.forEach(btn => {
        btn.addEventListener('click', () => setSessionMode(btn.dataset.mode));
      });
    }

    // Quick Device Selects in Preview
    if (el.quickCameraSelect) {
      el.quickCameraSelect.addEventListener('change', async () => {
        await initMediaPreview(el.quickCameraSelect.value, el.quickMicSelect ? el.quickMicSelect.value : null);
      });
    }
    if (el.quickMicSelect) {
      el.quickMicSelect.addEventListener('change', async () => {
        await initMediaPreview(el.quickCameraSelect ? el.quickCameraSelect.value : null, el.quickMicSelect.value);
      });
    }

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

    // Stage Layout Toggles
    if (el.btnLayoutGrid) el.btnLayoutGrid.addEventListener('click', () => setLayoutMode('grid'));
    if (el.btnLayoutSpotlight) el.btnLayoutSpotlight.addEventListener('click', () => setLayoutMode('spotlight'));
    if (el.ctrlLayout) el.ctrlLayout.addEventListener('click', toggleLayoutMode);

    // Spotlight PiP Corner Tile Click
    if (el.ownPipTile) {
      el.ownPipTile.addEventListener('click', () => {
        state.spotlightPeerId = null;
        updateSpotlightView();
        updateParticipantsList();
      });
    }

    // Reactions Popover & Emoji Buttons
    if (el.ctrlReactions) {
      el.ctrlReactions.addEventListener('click', (e) => {
        e.stopPropagation();
        el.reactionsPopover.classList.toggle('open');
      });
    }
    if (el.btnReactionsTopbar) {
      el.btnReactionsTopbar.addEventListener('click', (e) => {
        e.stopPropagation();
        el.reactionsPopover.classList.toggle('open');
      });
    }

    document.addEventListener('click', (e) => {
      if (el.reactionsPopover && !el.reactionsPopover.contains(e.target)) {
        el.reactionsPopover.classList.remove('open');
      }
    });

    if (el.reactionEmojiBtns) {
      el.reactionEmojiBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          sendReaction(btn.dataset.emoji);
          el.reactionsPopover.classList.remove('open');
        });
      });
    }

    // Keyboard Spacebar for Push-to-Talk / Mute
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && state.inCall && document.activeElement.tagName !== 'INPUT') {
        e.preventDefault();
        toggleMicrophone();
      }
    });

    // Chat Drawer
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
      showToast('Settings saved!');
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

    const savedAutoJoin = localStorage.getItem('omnicall_auto_join') === 'true';
    const savedAutoRoom = localStorage.getItem('omnicall_auto_room');

    if (autojoinUrl && el.inputRoom.value.trim()) {
      triggerJoinWithMedia();
    } else if (savedAutoJoin && savedAutoRoom) {
      el.inputRoom.value = savedAutoRoom;
      triggerJoinWithMedia();
    }

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
      if (!state.localStream) {
        await initMediaPreview();
      }
      joinMeeting();
    }, 600);
  }

  // Run on page load
  document.addEventListener('DOMContentLoaded', init);
})();
