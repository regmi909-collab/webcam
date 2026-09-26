const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  getScreenSources: () => ipcRenderer.invoke('get-screen-sources'),
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  openExternal: (url) => ipcRenderer.send('open-external', url),
  copyToClipboard: (text) => ipcRenderer.send('copy-to-clipboard', text),
  getLaunchArgs: () => ipcRenderer.invoke('get-launch-args'),
  getAutoStart: () => ipcRenderer.invoke('get-autostart'),
  setAutoStart: (enable) => ipcRenderer.invoke('set-autostart', enable),
  onAutoJoinRoom: (callback) => {
    ipcRenderer.on('auto-join-room', (event, data) => callback(data));
  },
  onToggleMuteShortcut: (callback) => {
    ipcRenderer.on('shortcut-toggle-mute', callback);
  }
});
