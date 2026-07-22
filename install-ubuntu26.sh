#!/usr/bin/env bash
set -Eeuo pipefail

APP_NAME="explorer-YERB"
APP_USER="${SUDO_USER:-$USER}"
APP_HOME="$(getent passwd "$APP_USER" | cut -d: -f6)"
APP_DIR="${APP_DIR:-$APP_HOME/$APP_NAME}"
REPO_URL="${REPO_URL:-https://github.com/The-Yerbas-Endeavor/explorer-YERB.git}"
BRANCH="${BRANCH:-ubuntu-26}"
NODE_MAJOR="${NODE_MAJOR:-22}"
MONGODB_MAJOR="${MONGODB_MAJOR:-8.0}"
PORT="${PORT:-3001}"

log() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
fail() { printf '\n\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || fail "Run with sudo: sudo bash install-ubuntu26.sh"
source /etc/os-release
[[ "${ID:-}" == "ubuntu" ]] || fail "Ubuntu is required"

log "Installing base packages"
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y \
  ca-certificates curl gnupg git build-essential python3 pkg-config nginx ufw

log "Installing Node.js ${NODE_MAJOR}"
install -d -m 0755 /etc/apt/keyrings
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
  | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
printf 'deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_%s.x nodistro main\n' "$NODE_MAJOR" \
  > /etc/apt/sources.list.d/nodesource.list
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs

log "Installing MongoDB ${MONGODB_MAJOR}"
# MongoDB may not publish an Ubuntu 26 repository immediately. Use the newest
# supported Ubuntu repository as a compatibility source until native packages exist.
MONGO_SUITE="noble"
curl -fsSL "https://www.mongodb.org/static/pgp/server-${MONGODB_MAJOR}.asc" \
  | gpg --dearmor -o "/etc/apt/keyrings/mongodb-server-${MONGODB_MAJOR}.gpg"
printf 'deb [arch=amd64,arm64 signed-by=/etc/apt/keyrings/mongodb-server-%s.gpg] https://repo.mongodb.org/apt/ubuntu %s/mongodb-org/%s multiverse\n' \
  "$MONGODB_MAJOR" "$MONGO_SUITE" "$MONGODB_MAJOR" \
  > "/etc/apt/sources.list.d/mongodb-org-${MONGODB_MAJOR}.list"
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y mongodb-org
systemctl enable --now mongod

log "Installing PM2"
npm install --global pm2

log "Downloading explorer"
if [[ -d "$APP_DIR/.git" ]]; then
  sudo -u "$APP_USER" git -C "$APP_DIR" fetch --all --prune
  sudo -u "$APP_USER" git -C "$APP_DIR" checkout "$BRANCH"
  sudo -u "$APP_USER" git -C "$APP_DIR" pull --ff-only origin "$BRANCH"
else
  sudo -u "$APP_USER" git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi

log "Installing Node dependencies"
cd "$APP_DIR"
if [[ -f package-lock.json ]]; then
  sudo -u "$APP_USER" npm ci --omit=dev
else
  sudo -u "$APP_USER" npm install --omit=dev
fi

log "Creating environment file"
cat > "$APP_DIR/.env.ubuntu26" <<EOF
NODE_ENV=production
PORT=$PORT
EOF
chown "$APP_USER:$APP_USER" "$APP_DIR/.env.ubuntu26"
chmod 600 "$APP_DIR/.env.ubuntu26"

log "Configuring PM2"
sudo -u "$APP_USER" env PATH="$PATH" pm2 delete "$APP_NAME" >/dev/null 2>&1 || true
sudo -u "$APP_USER" env PATH="$PATH" pm2 start "$APP_DIR/bin/instance" \
  --name "$APP_NAME" \
  --interpreter "$(command -v node)" \
  --node-args="--stack-size=10000" \
  --cwd "$APP_DIR"
sudo -u "$APP_USER" env PATH="$PATH" pm2 save
pm2 startup systemd -u "$APP_USER" --hp "$APP_HOME" >/tmp/pm2-startup.txt
bash -c "$(tail -n 1 /tmp/pm2-startup.txt)" || true

log "Configuring nginx"
cat > /etc/nginx/sites-available/explorer-YERB <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOF
ln -sfn /etc/nginx/sites-available/explorer-YERB /etc/nginx/sites-enabled/explorer-YERB
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable --now nginx
systemctl reload nginx

log "Configuring firewall"
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

log "Installation complete"
printf 'Explorer directory: %s\n' "$APP_DIR"
printf 'Explorer URL:       http://SERVER_IP/\n'
printf 'MongoDB status:     systemctl status mongod\n'
printf 'Explorer status:    sudo -u %s pm2 status\n' "$APP_USER"
printf '\nEdit settings.json before production use, then restart with:\n'
printf '  sudo -u %s pm2 restart %s\n' "$APP_USER" "$APP_NAME"
