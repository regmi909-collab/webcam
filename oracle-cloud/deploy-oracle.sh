#!/bin/bash
set -e

# ==============================================================================
# OmniCall - Oracle Cloud Always Free 1-Click Deployment Script
# Supports: Ubuntu 20.04/22.04/24.04 & Oracle Linux 8/9 (x86_64 and ARM64 Ampere)
# ==============================================================================

echo "=========================================================="
echo "  OmniCall Unlimited Video & Audio Calling Server Setup"
echo "  Optimized for Oracle Cloud Always Free Tier"
echo "=========================================================="

# Check root
if [ "$EUID" -ne 0 ]; then
  echo "[-] Please run as root: sudo bash deploy-oracle.sh"
  exit 1
fi

echo "[1/5] Detecting OS and installing dependencies..."
if [ -f /etc/oracle-release ]; then
  # Oracle Linux
  dnf install -y dnf-utils zip unzip curl git
  dnf config-manager --add-repo=https://download.docker.com/linux/centos/docker-ce.repo
  dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
  systemctl enable --now docker
elif [ -f /etc/lsb-release ] || [ -f /etc/debian_version ]; then
  # Ubuntu / Debian
  apt-get update
  apt-get install -y curl git ufw iptables-persistent ca-certificates
  # Install Docker
  if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    rm -f get-docker.sh
  fi
fi

echo "[2/5] Configuring Oracle OS Firewall Ports..."
# On Oracle Cloud, default iptables blocks traffic even if Security List is open.
# We explicitly allow required ports:
# 80/tcp (HTTP), 443/tcp (HTTPS), 7880/tcp (LiveKit), 7881/tcp (RTC TCP),
# 3478/udp/tcp (STUN/TURN), 50000:50100/udp (LiveKit WebRTC Media Range)

if command -v firewalld &> /dev/null && systemctl is-active --quiet firewalld; then
  firewall-cmd --permanent --add-port=80/tcp
  firewall-cmd --permanent --add-port=443/tcp
  firewall-cmd --permanent --add-port=7880/tcp
  firewall-cmd --permanent --add-port=7881/tcp
  firewall-cmd --permanent --add-port=3478/tcp
  firewall-cmd --permanent --add-port=3478/udp
  firewall-cmd --permanent --add-port=50000-50100/udp
  firewall-cmd --reload
elif command -v ufw &> /dev/null; then
  ufw allow 80/tcp
  ufw allow 443/tcp
  ufw allow 7880/tcp
  ufw allow 7881/tcp
  ufw allow 3478/tcp
  ufw allow 3478/udp
  ufw allow 50000:50100/udp
fi

# Direct iptables rules for Oracle Cloud VCN compatibility
iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT || true
iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT || true
iptables -I INPUT 6 -m state --state NEW -p tcp --dport 7880 -j ACCEPT || true
iptables -I INPUT 6 -m state --state NEW -p tcp --dport 7881 -j ACCEPT || true
iptables -I INPUT 6 -m state --state NEW -p udp --dport 3478 -j ACCEPT || true
iptables -I INPUT 6 -m state --state NEW -p udp --dport 50000:50100 -j ACCEPT || true

echo "[3/5] Public IP & Domain Configuration..."
PUBLIC_IP=$(curl -s https://api.ipify.org || echo "localhost")
echo "Detected Public IP: $PUBLIC_IP"

read -p "Enter your Domain Name (e.g. call.yourdomain.com) or press ENTER to use Public IP [$PUBLIC_IP]: " USER_DOMAIN
DOMAIN="${USER_DOMAIN:-$PUBLIC_IP}"

export DOMAIN
echo "Configuring for domain/host: $DOMAIN"

echo "[4/5] Building and starting OmniCall Docker stack..."
cd "$(dirname "$0")"
docker compose down || true
docker compose up -d --build

echo "=========================================================="
echo "  [SUCCESS] OmniCall Server is now running!"
echo "=========================================================="
echo "  Web Calling Link:      https://$DOMAIN (or http://$DOMAIN:3000)"
echo "  LiveKit SFU Endpoint:  wss://$DOMAIN/rtc"
echo "  TURN Media Relay:      turn:$DOMAIN:3478"
echo ""
echo "  To view logs:"
echo "    docker compose logs -f"
echo "=========================================================="
