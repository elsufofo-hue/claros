#!/usr/bin/env bash
# Provisiona uma VPS Ubuntu 24.04 nova do zero até o stack no ar.
# Idempotente — pode rodar de novo sem quebrar. Use no DR (disaster recovery)
# quando precisar subir tudo num servidor novo.
#
# Uso (como root, na VPS nova):
#   curl -fsSL https://raw.githubusercontent.com/elsufofo-hue/claros/main/deploy/scripts/bootstrap-vps.sh | bash
#   # depois: cd /root/claros/deploy && nano .env && docker compose up -d --build
#
# Ou clone antes e rode local: deploy/scripts/bootstrap-vps.sh
set -euo pipefail

REPO_SSH="git@github-claros:elsufofo-hue/claros.git"
REPO_HTTPS="https://github.com/elsufofo-hue/claros.git"
APP_DIR="/root/claros"

echo "== 1. pacotes base =="
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ca-certificates curl git ufw

echo "== 2. swap 2G (evita OOM no build) =="
if ! swapon --show | grep -q swapfile; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  sysctl -qw vm.swappiness=10
  grep -q 'vm.swappiness' /etc/sysctl.conf || echo 'vm.swappiness=10' >> /etc/sysctl.conf
fi

echo "== 3. Docker =="
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh >/dev/null
fi
docker compose version

echo "== 4. firewall =="
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp  >/dev/null
ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null
ufw status | head -1

echo "== 5. clonar o repo =="
if [[ ! -d "$APP_DIR/.git" ]]; then
  # tenta SSH (precisa da deploy key configurada); cai pra HTTPS interativo.
  git clone "$REPO_SSH" "$APP_DIR" 2>/dev/null || git clone "$REPO_HTTPS" "$APP_DIR"
else
  git -C "$APP_DIR" pull --ff-only || true
fi

echo
echo "== pronto. Faltam só as variáveis: =="
echo "   cd $APP_DIR/deploy"
echo "   cp -n .env.example .env && nano .env      # domínios, senhas, tokens de gateway"
echo "   docker compose up -d --build"
echo
echo "   (restore de backup, se for DR:  deploy/scripts/restore.sh /caminho/claros-XXXX.sql.gz )"
