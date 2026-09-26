const { app, BrowserWindow, ipcMain, desktopCapturer, session, shell, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
const PORT = process.env.PORT || 3000;

// Chromium media switches: bypass internal prompt popups so webcam and mic are auto-granted
app.commandLine.appendSwitch('use-fake-ui-for-media-stream');
app.commandLine.appendSwitch('enable-features', 'WebRTCPipeWireCapturer');

// Register custom protocol omnicall:// for deep-linking (e.g. omnicall://team-standup)
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('omnicall', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('omnicall');
}

/**
 * Parse launch arguments from CLI or Windows deep-link protocol
 * Examples:
 *   OmniCall.exe --room=reception --name=Desk1 --autojoin
 *   omnicall://reception?name=Desk1&autojoin=true
 */
function parseLaunchArgs(argsArray) {
  const result = { room: '', name: '', autojoin: false };
  if (!Array.isArray(argsArray)) return result;

  for (let i = 0; i < argsArray.length; i++) {
    const arg = argsArray[i];
    if (typeof arg !== 'string') continue;

    if (arg.startsWith('omnicall://')) {
      try {
        const raw = arg.replace(/^omnicall:\/\/?/, '');
        if (raw.includes('?')) {
          const [roomPart, queryPart] = raw.split('?');
          result.room = roomPart.replace(/\/+$/, '') || result.room;
          const searchParams = new URLSearchParams(queryPart);
          if (searchParams.get('room')) result.room = searchParams.get('room');
          if (searchParams.get('name')) result.name = searchParams.get('name');
          if (searchParams.get('autojoin')) {
            result.autojoin = searchParams.get('autojoin') === 'true' || searchParams.get('autojoin') === '1';
          }
        } else {
          result.room = raw.replace(/\/+$/, '');
          result.autojoin = true;
        }
      } catch (e) {
        console.error('Error parsing omnicall protocol URL:', e);
      }
    } else if (arg.startsWith('--room=')) {
      result.room = arg.split('=')[1];
    } else if (arg === '--room' && argsArray[i + 1]) {
      result.room = argsArray[i + 1];
    } else if (arg.startsWith('--name=')) {
      result.name = arg.split('=')[1];
    } else if (arg === '--name' && argsArray[i + 1]) {
      result.name = argsArray[i + 1];
    } else if (arg === '--autojoin' || arg === '--autojoin=true' || arg === '--autojoin=1') {
      result.autojoin = true;
    }
  }
  return result;
}

// Start embedded Node.js backend when packaged in production if not already running
function startEmbeddedServer() {
  if (!isDev) {
    try {
      const serverPath = path.join(__dirname, '..', 'server', 'server.js');
      if (fs.existsSync(serverPath)) {
        require(serverPath);
        console.log('[OmniCall Main] Embedded signaling and API server started.');
      }
    } catch (err) {
      console.log('[OmniCall Main] Embedded server note:', err.message);
    }
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 920,
    minHeight: 640,
    frame: false, // Custom frameless title bar for premium look
    backgroundColor: '#090D16',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      webSecurity: true,
      allowRunningInsecureContent: false
    }
  });

  // Automatically approve media access requests (webcam, mic, screen, notifications)
  const allowedPermissions = [
    'media',
    'mediaKeySystem',
    'notifications',
    'display-capture',
    'window-management',
    'microphone',
    'camera'
  ];

  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (allowedPermissions.includes(permission)) {
      callback(true);
    } else {
      callback(false);
    }
  });

  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    return allowedPermissions.includes(permission);
  });

  // Parse command line launch parameters to build initial URL query
  const launchParams = parseLaunchArgs(process.argv);
  const queryParams = new URLSearchParams();
  if (launchParams.room) queryParams.set('room', launchParams.room);
  if (launchParams.name) queryParams.set('name', launchParams.name);
  if (launchParams.autojoin) queryParams.set('autojoin', 'true');
  const qs = queryParams.toString() ? `?${queryParams.toString()}` : '';

  // Load from local server (embedded or dev) or direct file fallback
  const appUrl = `http://localhost:${PORT}${qs}`;

  mainWindow.loadURL(appUrl).catch(() => {
    // If local port 3000 is still initializing, fallback to direct static HTML
    const queryObj = Object.fromEntries(queryParams.entries());
    mainWindow.loadFile(path.join(__dirname, 'public', 'index.html'), { query: queryObj });
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Window titlebar control handlers
  ipcMain.on('window-minimize', () => {
    if (mainWindow) mainWindow.minimize();
  });

  ipcMain.on('window-maximize', () => {
    if (mainWindow) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    }
  });

  ipcMain.on('window-close', () => {
    if (mainWindow) mainWindow.close();
  });

  ipcMain.handle('window-is-maximized', () => {
    return mainWindow ? mainWindow.isMaximized() : false;
  });

  ipcMain.on('open-external', (event, url) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
  });

  ipcMain.on('copy-to-clipboard', (event, text) => {
    try {
      clipboard.writeText(text);
    } catch (e) {
      console.error('Clipboard copy error:', e);
    }
  });

  // Screen Capturer for Windows Screen Sharing
  ipcMain.handle('get-screen-sources', async () => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['window', 'screen'],
        thumbnailSize: { width: 320, height: 180 }
      });
      return sources.map(source => ({
        id: source.id,
        name: source.name,
        thumbnail: source.thumbnail.toDataURL()
      }));
    } catch (err) {
      console.error('Error fetching screen sources:', err);
      return [];
    }
  });

  // Launch parameters for renderer
  ipcMain.handle('get-launch-args', () => {
    return parseLaunchArgs(process.argv);
  });

  // Windows Login Item (Auto-start with Windows)
  ipcMain.handle('get-autostart', () => {
    return app.getLoginItemSettings().openAtLogin;
  });

  ipcMain.handle('set-autostart', (event, enable) => {
    app.setLoginItemSettings({
      openAtLogin: Boolean(enable),
      path: process.execPath,
      args: ['--autostart']
    });
    return app.getLoginItemSettings().openAtLogin;
  });
}

// Single Instance Lock for Windows: prevent duplicate processes and route deep-link URLs to primary window
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();

      const parsed = parseLaunchArgs(commandLine);
      if (parsed.room || parsed.autojoin) {
        mainWindow.webContents.send('auto-join-room', parsed);
      }
    }
  });

  // App lifecycle
  app.whenReady().then(() => {
    startEmbeddedServer();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
