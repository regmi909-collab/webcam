/**
 * OmniCall Dev Runner
 * Automatically launches:
 * 1. LiveKit SFU server (bin/livekit-server.exe --dev) if present
 * 2. Node.js backend server (server/server.js)
 * 3. Electron Windows Desktop App (electron .)
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const processes = [];

function startProcess(name, cmd, args, cwd) {
  console.log(`[Dev] Starting ${name}: ${cmd} ${args.join(' ')}`);
  const child = spawn(cmd, args, {
    cwd: cwd || path.join(__dirname, '..'),
    stdio: 'inherit',
    shell: true
  });

  child.on('error', (err) => {
    console.error(`[Dev] ${name} failed to start:`, err.message);
  });

  processes.push({ name, child });
  return child;
}

// 1. Start LiveKit SFU Server if available
const livekitExe = path.join(__dirname, '..', 'bin', 'livekit-server.exe');
if (fs.existsSync(livekitExe)) {
  console.log('[Dev] LiveKit Server binary detected.');
  startProcess('LiveKit-SFU', livekitExe, ['--dev']);
} else {
  console.log('[Dev] No local LiveKit binary found. App will use Built-in WebRTC Mesh or remote SFU.');
}

// 2. Start Node.js Web & Signaling Server
setTimeout(() => {
  startProcess('NodeServer', 'node', ['server/server.js']);

  // 3. Launch Electron Desktop Window
  setTimeout(() => {
    const electronBin = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const electronProcess = startProcess('Electron', electronBin, ['electron', '.']);

    electronProcess.on('exit', () => {
      console.log('[Dev] Electron window closed. Shutting down all processes...');
      cleanup();
    });
  }, 1500);
}, 1000);

function cleanup() {
  processes.forEach(({ name, child }) => {
    try {
      console.log(`[Dev] Stopping ${name}...`);
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', child.pid, '/f', '/t']);
      } else {
        child.kill('SIGINT');
      }
    } catch (e) {
      // Ignored
    }
  });
  setTimeout(() => process.exit(0), 1000);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
