#!/usr/bin/env bash
# ===========================================================================
# Script de déploiement — PUMA Helpdesk
# Plateforme : Ubuntu 22.04 / Debian 12 (VPS)
# Usage      : sudo bash deploy.sh
# ===========================================================================
set -euo pipefail

# ── Couleurs ─────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info()  { echo -e "${BLUE}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

# ── Configuration (à adapter) ─────────────────────────────────────────────────
APP_DIR="/opt/puma-helpdesk"
APP_USER="puma"
API_PORT="3001"
DOMAIN=""          # ex: helpdesk.mondomaine.sn (laisser vide pour IP seule)
DB_NAME="puma_helpdesk"
DB_USER="puma_user"
NODE_VERSION="22"

# ── Vérifications préliminaires ───────────────────────────────────────────────
[[ $EUID -ne 0 ]] && error "Ce script doit être exécuté en tant que root (sudo)"

# ── 1. Dépendances système ────────────────────────────────────────────────────
info "Mise à jour des paquets système..."
apt-get update -qq && apt-get upgrade -y -qq

info "Installation des dépendances : curl, git, nginx, postgresql, certbot..."
apt-get install -y -qq \
  curl git build-essential \
  nginx \
  postgresql postgresql-contrib \
  certbot python3-certbot-nginx \
  ufw

# ── 2. Node.js via nvm ────────────────────────────────────────────────────────
if ! command -v node &>/dev/null || [[ "$(node -v | sed 's/v//' | cut -d. -f1)" -lt "$NODE_VERSION" ]]; then
  info "Installation de Node.js $NODE_VERSION via NodeSource..."
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_VERSION}.x" | bash -
  apt-get install -y nodejs
fi
ok "Node.js $(node -v) installé"

# ── 3. pnpm ───────────────────────────────────────────────────────────────────
if ! command -v pnpm &>/dev/null; then
  info "Installation de pnpm..."
  npm install -g pnpm@9
fi
ok "pnpm $(pnpm -v) installé"

# ── 4. PM2 (gestionnaire de processus) ───────────────────────────────────────
if ! command -v pm2 &>/dev/null; then
  info "Installation de PM2..."
  npm install -g pm2
fi
ok "PM2 installé"

# ── 5. Utilisateur applicatif ─────────────────────────────────────────────────
if ! id "$APP_USER" &>/dev/null; then
  info "Création de l'utilisateur $APP_USER..."
  useradd -m -s /bin/bash "$APP_USER"
fi

# ── 6. PostgreSQL ─────────────────────────────────────────────────────────────
info "Configuration de PostgreSQL..."
systemctl enable --now postgresql

DB_PASSWORD=$(openssl rand -base64 32)
sudo -u postgres psql -q <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$DB_USER') THEN
    CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';
  ELSE
    ALTER USER $DB_USER WITH PASSWORD '$DB_PASSWORD';
  END IF;
END
\$\$;

CREATE DATABASE $DB_NAME OWNER $DB_USER;
GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;
SQL
ok "Base de données '$DB_NAME' configurée"

DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@localhost:5432/${DB_NAME}"

# ── 7. Répertoire applicatif ──────────────────────────────────────────────────
info "Configuration du répertoire applicatif $APP_DIR..."
mkdir -p "$APP_DIR"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

# Copier le code source courant
info "Copie du code source vers $APP_DIR..."
rsync -a --delete \
  --exclude=".git" \
  --exclude="node_modules" \
  --exclude="*/dist" \
  --exclude="*/node_modules" \
  --exclude=".local" \
  "$(pwd)/" "$APP_DIR/"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

# ── 8. Variables d'environnement ──────────────────────────────────────────────
SESSION_SECRET=$(openssl rand -base64 64 | tr -d '\n')

info "Génération du fichier .env..."
cat > "$APP_DIR/.env" <<EOF
# PUMA Helpdesk — Production Environment
NODE_ENV=production
PORT=$API_PORT

# Base de données PostgreSQL
DATABASE_URL=$DATABASE_URL

# Sécurité des sessions
SESSION_SECRET=$SESSION_SECRET
EOF
chmod 600 "$APP_DIR/.env"
chown "$APP_USER:$APP_USER" "$APP_DIR/.env"
ok "Fichier .env créé dans $APP_DIR/.env"

# ── 9. Installation des dépendances ──────────────────────────────────────────
info "Installation des dépendances npm (pnpm install)..."
sudo -u "$APP_USER" bash -c "cd '$APP_DIR' && pnpm install --frozen-lockfile 2>&1"
ok "Dépendances installées"

# ── 10. Build du projet ───────────────────────────────────────────────────────
info "Build du projet (libs + API + frontend)..."
sudo -u "$APP_USER" bash -c "
  cd '$APP_DIR'
  source .env || true
  export DATABASE_URL='$DATABASE_URL'
  # Build les librairies partagées
  pnpm --filter './lib/**' run build 2>&1
  # Build l'API
  pnpm --filter @workspace/api-server run build 2>&1
  # Build le frontend
  pnpm --filter @workspace/puma-helpdesk run build 2>&1
"
ok "Build terminé"

# ── 11. Migration base de données ─────────────────────────────────────────────
info "Application des migrations Drizzle..."
sudo -u "$APP_USER" bash -c "
  cd '$APP_DIR/lib/db'
  DATABASE_URL='$DATABASE_URL' pnpm run push-force 2>&1
"
ok "Migrations appliquées"

# ── 12. Seed de la base de données (première installation uniquement) ─────────
if [[ -f "$APP_DIR/lib/db/src/seed.ts" ]] || [[ -f "$APP_DIR/lib/db/src/seed.js" ]]; then
  read -rp "$(echo -e "${YELLOW}Exécuter le seed (données de démonstration) ? [o/N] ${NC}")" SEED_CONFIRM
  if [[ "${SEED_CONFIRM:-N}" =~ ^[Oo]$ ]]; then
    sudo -u "$APP_USER" bash -c "
      cd '$APP_DIR/lib/db'
      DATABASE_URL='$DATABASE_URL' pnpm run seed 2>&1
    " && ok "Seed exécuté" || warn "Seed ignoré ou déjà effectué"
  fi
fi

# ── 13. Configuration PM2 ─────────────────────────────────────────────────────
info "Configuration de PM2..."
cat > "$APP_DIR/ecosystem.config.cjs" <<EOF
module.exports = {
  apps: [{
    name: 'puma-api',
    script: './dist/index.mjs',
    cwd: '$APP_DIR/artifacts/api-server',
    instances: 1,
    exec_mode: 'fork',
    env_file: '$APP_DIR/.env',
    env: {
      NODE_ENV: 'production',
      PORT: '$API_PORT',
    },
    log_file: '/var/log/puma-helpdesk/api.log',
    error_file: '/var/log/puma-helpdesk/api-error.log',
    time: true,
    restart_delay: 3000,
    max_restarts: 10,
  }]
};
EOF

mkdir -p /var/log/puma-helpdesk
chown -R "$APP_USER:$APP_USER" /var/log/puma-helpdesk

sudo -u "$APP_USER" bash -c "cd '$APP_DIR' && pm2 start ecosystem.config.cjs --env production"
sudo -u "$APP_USER" bash -c "pm2 save"
pm2 startup systemd -u "$APP_USER" --hp "/home/$APP_USER" | tail -1 | bash || true
ok "PM2 configuré"

# ── 14. Nginx ─────────────────────────────────────────────────────────────────
info "Configuration de Nginx..."

SERVER_NAME="${DOMAIN:-_}"
STATIC_DIR="$APP_DIR/artifacts/puma-helpdesk/dist"

cat > /etc/nginx/sites-available/puma-helpdesk <<NGINX
upstream puma_api {
  server 127.0.0.1:${API_PORT};
  keepalive 64;
}

server {
  listen 80;
  listen [::]:80;
  server_name ${SERVER_NAME};

  # Logs
  access_log /var/log/nginx/puma-helpdesk-access.log;
  error_log  /var/log/nginx/puma-helpdesk-error.log;

  # Frontend (fichiers statiques)
  root ${STATIC_DIR};
  index index.html;

  # Gzip
  gzip on;
  gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

  # Cache assets
  location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
  }

  # API proxy (JSON + SSE)
  location /api/ {
    proxy_pass         http://puma_api;
    proxy_http_version 1.1;
    proxy_set_header   Host              \$host;
    proxy_set_header   X-Real-IP         \$remote_addr;
    proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
    proxy_set_header   X-Forwarded-Proto \$scheme;
    proxy_set_header   Connection        '';
    proxy_buffering    off;
    proxy_cache        off;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
    chunked_transfer_encoding on;
  }

  # SPA — renvoyer index.html pour toutes les routes frontend
  location / {
    try_files \$uri \$uri/ /index.html;
  }
}
NGINX

ln -sf /etc/nginx/sites-available/puma-helpdesk /etc/nginx/sites-enabled/puma-helpdesk
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
ok "Nginx configuré"

# ── 15. Pare-feu UFW ──────────────────────────────────────────────────────────
info "Configuration du pare-feu UFW..."
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable
ok "UFW configuré (SSH + HTTP/HTTPS)"

# ── 16. SSL Let's Encrypt (si domaine fourni) ─────────────────────────────────
if [[ -n "$DOMAIN" ]]; then
  info "Configuration SSL avec Let's Encrypt pour $DOMAIN..."
  read -rp "$(echo -e "${YELLOW}Email pour Let's Encrypt (ex: admin@mondomaine.sn): ${NC}")" LE_EMAIL
  certbot --nginx -n --agree-tos --email "$LE_EMAIL" -d "$DOMAIN" || warn "SSL certbot échoué, vérifier DNS"
  systemctl enable certbot.timer
fi

# ── Résumé ────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  PUMA Helpdesk déployé avec succès !${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${BLUE}URL de l'application :${NC}"
if [[ -n "$DOMAIN" ]]; then
  echo -e "    https://$DOMAIN"
else
  echo -e "    http://$(curl -s ifconfig.me 2>/dev/null || echo 'VOTRE_IP')"
fi
echo ""
echo -e "  ${BLUE}Comptes de démonstration :${NC}"
echo -e "    Admin    : admin@puma.sn  / admin123"
echo -e "    Technicien : tech1@puma.sn / tech123"
echo -e "    Agent    : agent1@puma.sn / agent123"
echo ""
echo -e "  ${BLUE}Fichier .env :${NC} $APP_DIR/.env"
echo -e "  ${BLUE}Logs API    :${NC} /var/log/puma-helpdesk/api.log"
echo -e "  ${BLUE}Logs Nginx  :${NC} /var/log/nginx/puma-helpdesk-access.log"
echo ""
echo -e "  ${YELLOW}IMPORTANT : Changez les mots de passe par défaut en production !${NC}"
echo ""
