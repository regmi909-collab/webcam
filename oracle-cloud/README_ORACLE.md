# Oracle Cloud Free Tier Deployment Guide for OmniCall

This guide walks you through setting up an **Always Free** cloud server on Oracle Cloud Infrastructure (OCI) to host your **OmniCall Multi-Party SFU Video Calling Server** with zero monthly cost and unlimited call minutes.

---

## 1. Why Oracle Cloud Free Tier?
- **Always Free Compute:** 
  - **Ampere A1 (ARM64):** Up to 4 OCPUs and 24 GB of RAM (Free Forever!).
  - **AMD Micro:** 2 VMs with 1/8 OCPU and 1 GB RAM each.
- **Outbound Bandwidth:** **10 Terabytes/month free egress**, enough for thousands of hours of HD video calling every month!

---

## 2. Step 1: Create Your Free VM Instance
1. Log into your **Oracle Cloud Console** ([cloud.oracle.com](https://cloud.oracle.com)).
2. In the search bar or menu, go to **Compute > Instances** and click **Create Instance**.
3. Configure the VM:
   - **Name:** `omnicall-server`
   - **Image:** `Ubuntu 22.04 LTS` or `Oracle Linux 9` (both supported).
   - **Shape:** 
     - Choose **Ampere (ARM)**: Select 2 to 4 OCPUs and 12GB to 24GB RAM (Always Free Eligible).
   - **Networking:** Select your Default Virtual Cloud Network (VCN) and ensure **Assign a public IPv4 address** is checked.
   - **SSH Keys:** Save the private key to your computer (e.g., `id_rsa` or `ssh-key.key`).
4. Click **Create** and wait 1-2 minutes for the instance to show **Running**. Note down the **Public IP Address**.

---

## 3. Step 2: Open Ingress Ports in Oracle Cloud VCN
By default, Oracle Cloud blocks incoming ports. You must allow these ports in the VCN Security List:

1. In the Instance details, click on the **Virtual Cloud Network (VCN)** link.
2. In the left sidebar, click **Security Lists**, then click the **Default Security List**.
3. Click **Add Ingress Rules** and add the following:

| Source CIDR | IP Protocol | Destination Port Range | Description |
| :--- | :--- | :--- | :--- |
| `0.0.0.0/0` | **TCP** | `80, 443` | HTTP / HTTPS (Web Client & SSL) |
| `0.0.0.0/0` | **TCP** | `7880, 7881` | LiveKit SFU Signaling & TCP RTC |
| `0.0.0.0/0` | **UDP & TCP** | `3478` | Coturn STUN & TURN Relay |
| `0.0.0.0/0` | **UDP** | `50000-50100` | WebRTC Media Traffic Range |

4. Click **Add Ingress Rules**.

---

## 4. Step 3: Connect via SSH & Deploy with 1 Command

On your Windows computer, open PowerShell or Terminal:

```powershell
# Connect to your Oracle Cloud instance (replace with your IP and SSH key path)
ssh -i "path\to\your\ssh-key.key" ubuntu@YOUR_ORACLE_PUBLIC_IP
```

Once connected, run:

```bash
# 1. Clone or copy your omnicall project
git clone <your-repo-url> omnicall
cd omnicall/oracle-cloud

# 2. Run the automated deployment script
sudo bash deploy-oracle.sh
```

The script will automatically:
- Install Docker and Docker Compose
- Configure internal OS firewall (`iptables` / `firewalld`)
- Set up automatic SSL with Let's Encrypt
- Start the LiveKit SFU server, Node.js backend, and Coturn TURN relay

---

## 5. Step 4: Connect Windows App to Your Oracle Cloud Server
1. Open your **OmniCall Windows Software**.
2. Click the **Gear icon (Settings)** at the bottom.
3. In **Server Target**, enter your Oracle server domain or IP:
   - If using domain with SSL: `https://call.yourdomain.com`
   - If using IP: `http://YOUR_ORACLE_PUBLIC_IP:3000`
4. Click **Save Settings**.
5. Your calls now route through your high-powered, zero-cost Oracle Cloud SFU server with unlimited duration!
