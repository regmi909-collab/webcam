# OmniCall - Unlimited Video & Audio Calling Software for Windows

> **Windows Desktop Application & Enterprise WebRTC Conference Platform**  
> *Zero artificial time limits • 1080p 60fps HD video • 48kHz Opus audio • Screen sharing • Direct P2P file transfers • Oracle Cloud Always Free deployment kit.*

---

## 🌟 Key Features

- ⏱️ **Unlimited Call Duration:** No 40-minute caps, no paywalls, no monthly subscription fees.
- 🏢 **Multi-Party Conference Calling (10+ Users):** Built on an enterprise Selective Forwarding Unit (SFU) architecture with adaptive bitrate streaming, dynamic quality downscaling, and simulcast.
- ⚡ **Dual Calling Engines:**
  1. **LiveKit SFU Engine:** Handles 10 to 100+ callers in a single conference room. Ready for local execution and 1-click Oracle Cloud Free Tier deployment.
  2. **Direct P2P Mesh Engine:** Decentralized peer-to-peer WebRTC mesh for direct connections with zero server media bandwidth.
- 🖥️ **Windows Desktop Experience:** Built with Electron, featuring a custom obsidian glass frameless title bar, system tray minimization, push-to-talk (`Spacebar`), and native Windows screen sharing.
- 🌐 **Guest Web Access:** Friends and colleagues can join any room from any device (Windows, Mac, iPhone, Android) via a standard web link (`http://<ip>:3000/?room=XYZ`) with zero software installation required.
- 🎛️ **Audio & Video Enhancements:** Built-in Acoustic Echo Cancellation (AEC), Noise Suppression, and Auto Gain Control (AGC).
- 🎙️ **Live Microphone Meter:** Visual waveform volume meter in both the lobby and the in-call interface to verify audio levels before and during the call.
- 📁 **Direct P2P File Sharing:** Send files of any size directly between callers via WebRTC DataChannels at maximum internet speed without touching third-party servers.
- 📊 **Network Diagnostics HUD:** Real-time round-trip latency (RTT), packet loss, and video resolution monitor.

---

## 🚀 Quick Start on Windows

### 1. Launch Everything in Development Mode
To launch the LiveKit SFU server, the Node.js backend, and the Windows Electron Desktop window all at once:

```powershell
npm start
```

### 2. Run Components Individually (Optional)
If you prefer running components separately:

- **Run Node.js Web & Signaling Server:**
  ```powershell
  npm run server
  ```
  *(Access from any web browser at `http://localhost:3000`)*

- **Run Local LiveKit SFU Server:**
  ```powershell
  npm run livekit:local
  ```

- **Run Electron Windows App:**
  ```powershell
  npm run app
  ```

### 3. Build Standalone Windows Executable (.exe)
To package the desktop app into a standalone Windows installer and portable `.exe`:

```powershell
npm run build:win
```
The compiled installer will be generated in the `dist/` directory.

---

## ☁️ Oracle Cloud Always Free Deployment

You can host your own dedicated 24/7 video calling server on **Oracle Cloud Infrastructure (OCI)** at **$0/month forever**.

### Why Oracle Cloud Free Tier?
- **Compute:** Up to 4 ARM Ampere A1 cores and 24 GB of RAM (Free Forever!).
- **Bandwidth:** **10 Terabytes of free outbound traffic each month**, easily handling hundreds of hours of high-definition multi-party video conferencing.

### 1-Click Deployment Instructions
Full details and VCN firewall settings are documented in [`oracle-cloud/README_ORACLE.md`](file:///c:/Users/Sudeep/webcam/oracle-cloud/README_ORACLE.md).

1. Launch an **Always Free Ampere A1 (Ubuntu 22.04 or Oracle Linux 9)** instance on Oracle Cloud.
2. In the Oracle VCN Security List, open ports:
   - `80, 443 (TCP)` - Web Client & Automatic Let's Encrypt SSL
   - `7880, 7881 (TCP)` - LiveKit SFU Signaling & TCP RTC
   - `3478 (TCP/UDP)` - Coturn STUN/TURN Media Relay
   - `50000-50100 (UDP)` - WebRTC RTC Media Ports
3. SSH into your Oracle VM and run:
   ```bash
   cd oracle-cloud
   sudo bash deploy-oracle.sh
   ```
4. In your Windows OmniCall app, click **Settings (Gear Icon)** and enter your Oracle Cloud IP or domain (e.g. `https://call.yourdomain.com`).

---

## 📁 Repository Structure

```
c:\Users\Sudeep\webcam\
├── bin/
│   └── livekit-server.exe       # Precompiled local SFU server for Windows
├── server/
│   └── server.js                # Express API, token generator & WebSocket signaling
├── src/
│   ├── main.js                  # Electron main process (frameless window, permissions)
│   ├── preload.js               # Secure IPC contextBridge
│   └── public/                  # Frontend Web & Electron Renderer
│       ├── index.html           # Lobby, active call stage, and controls UI
│       ├── css/style.css        # Obsidian dark theme & glassmorphic layout
│       └── js/
│           ├── vendor/          # livekit-client UMD bundle
│           ├── webrtc-mesh.js   # Built-in P2P Mesh Calling Engine
│           ├── livekit-sfu.js   # LiveKit SFU Multi-party Engine
│           └── app.js           # Master UI and hardware media controller
├── oracle-cloud/                # Production Oracle Cloud Deployment Kit
│   ├── docker-compose.yml       # Docker stack (LiveKit + Node + Coturn + Caddy SSL)
│   ├── deploy-oracle.sh         # 1-click bash deployment script
│   ├── livekit.yaml             # Production SFU configuration
│   ├── turnserver.conf          # Coturn TURN server config
│   ├── Caddyfile                # Automatic HTTPS reverse proxy config
│   └── README_ORACLE.md         # Step-by-step Oracle Cloud setup guide
├── scripts/
│   └── dev.js                   # Unified development runner
└── package.json
```
