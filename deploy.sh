#!/usr/bin/env bash
# ===========================================================================
# Script de déploiement — PUMA Helpdesk
# Plateforme : CentOS 10 Stream / RHEL 10 / AlmaLinux / Rocky Linux
# Usage      : sudo bash deploy.sh
# ===========================================================================
set -euo pipefail

# ── Couleurs ─────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${BLUE}[INFO]${NC}    $*"; }
ok()      { echo -e "${GREEN}[OK]${NC}      $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}    $*"; }
error()   { echo -e "${RED}[ERREUR]${NC}  $*"; exit 1; }
section() { echo -e "\n${CYAN}══════════════════════════════════════════════════${NC}"; echo -e "${CYAN}  $*${NC}"; echo -e "${CYAN}══════════════════════════════════════════════════${NC}"; }

# ── Configuration (à adapter avant de lancer) ─────────────────────────────────
APP_DIR="/opt/puma-helpdesk"
APP_USER="puma"
DOMAIN=""              # ex: helpdesk.mondomaine.sn (laisser vide pour IP seule)
DB_NAME="puma_helpdesk"
DB_USER="puma_user"
NODE_VERSION="22"
NGINX_CONF="/etc/nginx/conf.d/puma-helpdesk.conf"
PM2_APP_NAME="puma-api"

# ── Vérifications préliminaires ───────────────────────────────────────────────
[[ $EUID -ne 0 ]] && error "Ce script doit être exécuté en tant que root (sudo bash deploy.sh)"
command -v dnf &>/dev/null || error "dnf introuvable — ce script est prévu pour CentOS/RHEL/AlmaLinux/Rocky"

# ─────────────────────────────────────────────────────────────────────────────
section "ÉTAPE 1 — Analyse de l'environnement existant"
# ─────────────────────────────────────────────────────────────────────────────

# ── Détection de l'IP principale ─────────────────────────────────────────────
PRIMARY_IP=$(ip route get 1.1.1.1 2>/dev/null | awk '{print $7; exit}' || hostname -I | awk '{print $1}')
info "Adresse IP principale détectée : ${GREEN}$PRIMARY_IP${NC}"

# ── Fonction de détection de port ────────────────────────────────────────────
port_is_free() {
  ! ss -tlnp 2>/dev/null | grep -q ":${1} " && \
  ! ss -tlnp 2>/dev/null | grep -q ":${1}\b"
}

port_owner() {
  ss -tlnp 2>/dev/null | grep ":${1} \|:${1}\b" | \
    grep -oP 'users:\(\(".*?"\)' | head -1 | grep -oP '".*?"' | head -1 | tr -d '"' || echo "inconnu"
}

# ── Inventaire des ports ──────────────────────────────────────────────────────
echo ""
info "Inventaire des ports actifs sur $PRIMARY_IP :"
echo -e "  ${CYAN}PORT   STATUT    PROCESSUS${NC}"
for p in 80 443 3000 3001 3002 3003 3004 5432 5433; do
  if port_is_free "$p"; then
    echo -e "  ${p}     ${GREEN}libre${NC}"
  else
    owner=$(port_owner "$p")
    echo -e "  ${p}     ${RED}occupé${NC}   → $owner"
  fi
done
echo ""

# ── Sélection automatique du port API ────────────────────────────────────────
API_PORT=""
for candidate in 3001 3002 3003 3004 3005; do
  if port_is_free "$candidate"; then
    API_PORT="$candidate"
    break
  fi
done
[[ -z "$API_PORT" ]] && error "Aucun port libre trouvé entre 3001 et 3005. Libérez un port et relancez."
info "Port API sélectionné : ${GREEN}$API_PORT${NC}"

# ── Vérification port 80 ──────────────────────────────────────────────────────
HTTP_PORT=80
if ! port_is_free 80; then
  HTTP_OWNER=$(port_owner 80)
  warn "Le port 80 est déjà utilisé par : $HTTP_OWNER"
  warn "PUMA Helpdesk sera ajouté à Nginx existant sans toucher aux autres vhosts."
  # Vérifier si c'est bien Nginx qui tourne (cas où on peut ajouter un vhost)
  if ! echo "$HTTP_OWNER" | grep -qi "nginx"; then
    warn "Le port 80 est occupé par un autre service ($HTTP_OWNER)."
    read -rp "$(echo -e "${YELLOW}Continuer quand même ? (Nginx sera configuré mais pas actif sur 80) [o/N] ${NC}")" CONT
    [[ "${CONT:-N}" =~ ^[Oo]$ ]] || error "Déploiement annulé."
  fi
fi

# ── Vérification de Nginx existant ───────────────────────────────────────────
NGINX_ALREADY_CONFIGURED=false
if [[ -f "$NGINX_CONF" ]]; then
  warn "Une configuration Nginx PUMA Helpdesk existe déjà : $NGINX_CONF"
  read -rp "$(echo -e "${YELLOW}Écraser la configuration Nginx existante ? [o/N] ${NC}")" OVERWRITE_NGINX
  [[ "${OVERWRITE_NGINX:-N}" =~ ^[Oo]$ ]] || { NGINX_ALREADY_CONFIGURED=true; warn "Config Nginx inchangée."; }
fi

# ── Vérification d'une installation existante de PUMA ────────────────────────
FRESH_INSTALL=true
if [[ -d "$APP_DIR" ]] && [[ -f "$APP_DIR/.env" ]]; then
  FRESH_INSTALL=false
  warn "Une installation PUMA Helpdesk existe déjà dans $APP_DIR"
  info "Mode : mise à jour (le .env et la base de données existants seront conservés)"
  # Récupérer le port API existant
  EXISTING_PORT=$(grep -E "^PORT=" "$APP_DIR/.env" 2>/dev/null | cut -d= -f2 || echo "")
  if [[ -n "$EXISTING_PORT" ]] && [[ "$EXISTING_PORT" != "$API_PORT" ]]; then
    if port_is_free "$EXISTING_PORT" || ss -tlnp | grep -q ":$EXISTING_PORT.*pm2\|node"; then
      info "Port API conservé depuis .env existant : $EXISTING_PORT"
      API_PORT="$EXISTING_PORT"
    fi
  fi
fi

# ── Vérification de PM2 ───────────────────────────────────────────────────────
PM2_EXISTS=false
if command -v pm2 &>/dev/null && sudo -u "${APP_USER}" pm2 list 2>/dev/null | grep -q "$PM2_APP_NAME"; then
  PM2_EXISTS=true
  info "Processus PM2 '$PM2_APP_NAME' déjà présent → sera redémarré après le build"
fi

# ── Vérification PostgreSQL ───────────────────────────────────────────────────
DB_EXISTS=false
PG_SYS_USER="postgres"
if systemctl is-active --quiet postgresql 2>/dev/null || systemctl is-active --quiet postgresql-16 2>/dev/null; then
  if sudo -u "$PG_SYS_USER" psql -lqt 2>/dev/null | cut -d\| -f1 | grep -qw "$DB_NAME"; then
    DB_EXISTS=true
    info "Base de données '$DB_NAME' déjà présente → conservée"
  fi
fi

# ── Récapitulatif avant de continuer ─────────────────────────────────────────
echo ""
echo -e "${CYAN}┌─────────────────────────────────────────────────────┐${NC}"
echo -e "${CYAN}│  Résumé du déploiement prévu                        │${NC}"
echo -e "${CYAN}├─────────────────────────────────────────────────────┤${NC}"
echo -e "${CYAN}│${NC}  IP principale    : ${GREEN}$PRIMARY_IP${NC}"
echo -e "${CYAN}│${NC}  Port HTTP        : ${GREEN}$HTTP_PORT${NC}"
echo -e "${CYAN}│${NC}  Port API (Node)  : ${GREEN}$API_PORT${NC}"
echo -e "${CYAN}│${NC}  Répertoire app   : ${GREEN}$APP_DIR${NC}"
echo -e "${CYAN}│${NC}  Installation     : $([ "$FRESH_INSTALL" = true ] && echo "${GREEN}Nouvelle${NC}" || echo "${YELLOW}Mise à jour${NC}")"
echo -e "${CYAN}│${NC}  Base de données  : $([ "$DB_EXISTS" = true ] && echo "${YELLOW}Existante (conservée)${NC}" || echo "${GREEN}À créer${NC}")"
echo -e "${CYAN}│${NC}  Nginx            : $([ "$NGINX_ALREADY_CONFIGURED" = true ] && echo "${YELLOW}Non modifié${NC}" || echo "${GREEN}À configurer${NC}")"
[[ -n "$DOMAIN" ]] && echo -e "${CYAN}│${NC}  Domaine          : ${GREEN}$DOMAIN${NC}"
echo -e "${CYAN}└─────────────────────────────────────────────────────┘${NC}"
echo ""
read -rp "$(echo -e "${YELLOW}Lancer le déploiement avec ces paramètres ? [O/n] ${NC}")" GO
[[ "${GO:-O}" =~ ^[Nn]$ ]] && { info "Déploiement annulé."; exit 0; }

# ─────────────────────────────────────────────────────────────────────────────
section "ÉTAPE 2 — Installation des dépendances système"
# ─────────────────────────────────────────────────────────────────────────────

dnf update -y -q
dnf install -y -q curl git wget tar gcc gcc-c++ make openssl rsync iproute

# ── Node.js ───────────────────────────────────────────────────────────────────
if ! command -v node &>/dev/null || [[ "$(node -v | sed 's/v//' | cut -d. -f1)" -lt "$NODE_VERSION" ]]; then
  info "Installation de Node.js $NODE_VERSION via NodeSource..."
  curl -fsSL "https://rpm.nodesource.com/setup_${NODE_VERSION}.x" | bash - >/dev/null 2>&1
  dnf install -y nodejs
fi
ok "Node.js $(node -v)"

# ── pnpm ──────────────────────────────────────────────────────────────────────
command -v pnpm &>/dev/null || npm install -g pnpm@9
ok "pnpm $(pnpm -v)"

# ── PM2 ───────────────────────────────────────────────────────────────────────
command -v pm2 &>/dev/null || npm install -g pm2
ok "PM2 installé"

# ── Nginx ─────────────────────────────────────────────────────────────────────
if ! command -v nginx &>/dev/null; then
  dnf install -y nginx
fi
systemctl enable nginx
ok "Nginx disponible"

# ─────────────────────────────────────────────────────────────────────────────
section "ÉTAPE 3 — PostgreSQL"
# ─────────────────────────────────────────────────────────────────────────────

PG_RUNNING=false
for svc in postgresql postgresql-16; do
  if systemctl is-active --quiet "$svc" 2>/dev/null; then
    PG_RUNNING=true; break
  fi
done

if [[ "$PG_RUNNING" = false ]]; then
  info "Installation de PostgreSQL 16..."
  # Dépôt PGDG officiel
  if ! rpm -q pgdg-redhat-repo &>/dev/null; then
    dnf install -y "https://download.postgresql.org/pub/repos/yum/reporpms/EL-9-x86_64/pgdg-redhat-repo-latest.noarch.rpm" 2>/dev/null || true
    dnf module disable -y postgresql 2>/dev/null || true
  fi
  dnf install -y postgresql16-server postgresql16 2>/dev/null || \
    dnf install -y postgresql-server postgresql 2>/dev/null || \
    error "Impossible d'installer PostgreSQL"

  PG_SETUP=$(command -v postgresql-16-setup 2>/dev/null || command -v postgresql-setup 2>/dev/null || echo "")
  [[ -n "$PG_SETUP" ]] && $PG_SETUP --initdb 2>/dev/null || true

  systemctl enable postgresql-16 2>/dev/null || systemctl enable postgresql 2>/dev/null
  systemctl start  postgresql-16 2>/dev/null || systemctl start  postgresql 2>/dev/null
  sleep 3
  ok "PostgreSQL installé et démarré"
else
  ok "PostgreSQL déjà actif"
fi

# ── Création base de données et utilisateur ────────────────────────────────────
if [[ "$DB_EXISTS" = false ]]; then
  info "Création de la base de données '$DB_NAME'..."
  DB_PASSWORD=$(openssl rand -base64 32 | tr -d '/+=' | head -c 30)

  sudo -u "$PG_SYS_USER" psql -q <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$DB_USER') THEN
    CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';
  ELSE
    ALTER USER $DB_USER WITH PASSWORD '$DB_PASSWORD';
  END IF;
END
\$\$;

SELECT 'CREATE DATABASE $DB_NAME OWNER $DB_USER'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$DB_NAME')
\gexec

GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;
SQL
  ok "Base de données créée"
  DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@localhost:5432/${DB_NAME}"
else
  # Récupérer l'URL depuis le .env existant
  DATABASE_URL=$(grep -E "^DATABASE_URL=" "$APP_DIR/.env" 2>/dev/null | cut -d= -f2- || "")
  if [[ -z "$DATABASE_URL" ]]; then
    warn "DATABASE_URL introuvable dans .env existant"
    read -rp "$(echo -e "${YELLOW}Entrez le mot de passe PostgreSQL pour '$DB_USER': ${NC}")" DB_PASSWORD
    DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@localhost:5432/${DB_NAME}"
  else
    info "Connexion DB conservée depuis .env existant"
    ok "Base de données conservée"
  fi
fi

# ─────────────────────────────────────────────────────────────────────────────
section "ÉTAPE 4 — Déploiement du code"
# ─────────────────────────────────────────────────────────────────────────────

# Créer l'utilisateur applicatif si besoin
if ! id "$APP_USER" &>/dev/null; then
  useradd -m -s /bin/bash "$APP_USER"
  ok "Utilisateur '$APP_USER' créé"
fi

mkdir -p "$APP_DIR"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

info "Copie du code source vers $APP_DIR (les fichiers de configuration sont préservés)..."
rsync -a --delete \
  --exclude=".git" \
  --exclude="node_modules" \
  --exclude="*/dist" \
  --exclude="*/node_modules" \
  --exclude=".local" \
  --exclude=".env" \
  "$(pwd)/" "$APP_DIR/"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"
ok "Code source copié"

# ── Fichier .env (créer uniquement si inexistant) ─────────────────────────────
if [[ "$FRESH_INSTALL" = true ]]; then
  SESSION_SECRET=$(openssl rand -base64 64 | tr -d '\n')
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
  ok "Fichier .env créé"
else
  # Mise à jour uniquement du PORT si nécessaire
  sed -i "s/^PORT=.*/PORT=$API_PORT/" "$APP_DIR/.env"
  chown "$APP_USER:$APP_USER" "$APP_DIR/.env"
  ok "Fichier .env existant conservé (PORT mis à jour si besoin)"
fi

# ─────────────────────────────────────────────────────────────────────────────
section "ÉTAPE 5 — Build"
# ─────────────────────────────────────────────────────────────────────────────

info "Installation des dépendances (pnpm install)..."
sudo -u "$APP_USER" bash -c "cd '$APP_DIR' && pnpm install --frozen-lockfile 2>&1"
ok "Dépendances installées"

info "Build des librairies partagées..."
sudo -u "$APP_USER" bash -c "cd '$APP_DIR' && pnpm --filter './lib/**' run build 2>&1"

info "Build de l'API Express..."
sudo -u "$APP_USER" bash -c "cd '$APP_DIR' && pnpm --filter @workspace/api-server run build 2>&1"

info "Build du frontend React/Vite..."
sudo -u "$APP_USER" bash -c "cd '$APP_DIR' && pnpm --filter @workspace/puma-helpdesk run build 2>&1"
ok "Build terminé"

# ─────────────────────────────────────────────────────────────────────────────
section "ÉTAPE 6 — Migrations base de données"
# ─────────────────────────────────────────────────────────────────────────────

info "Application des migrations Drizzle..."
sudo -u "$APP_USER" bash -c "
  set -a; source '$APP_DIR/.env'; set +a
  cd '$APP_DIR/lib/db'
  pnpm run push-force 2>&1
"
ok "Migrations appliquées"

if [[ "$FRESH_INSTALL" = true ]]; then
  read -rp "$(echo -e "${YELLOW}Injecter les données de démonstration (comptes admin/tech/agent) ? [o/N] ${NC}")" SEED_CONFIRM
  if [[ "${SEED_CONFIRM:-N}" =~ ^[Oo]$ ]]; then
    sudo -u "$APP_USER" bash -c "
      set -a; source '$APP_DIR/.env'; set +a
      cd '$APP_DIR/lib/db'
      pnpm run seed 2>&1
    " && ok "Données de démonstration injectées" || warn "Seed ignoré (données déjà présentes ?)"
  fi
fi

# ─────────────────────────────────────────────────────────────────────────────
section "ÉTAPE 7 — PM2"
# ─────────────────────────────────────────────────────────────────────────────

mkdir -p /var/log/puma-helpdesk
chown -R "$APP_USER:$APP_USER" /var/log/puma-helpdesk

cat > "$APP_DIR/ecosystem.config.cjs" <<EOF
module.exports = {
  apps: [{
    name: '$PM2_APP_NAME',
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
chown "$APP_USER:$APP_USER" "$APP_DIR/ecosystem.config.cjs"

if [[ "$PM2_EXISTS" = true ]]; then
  info "Redémarrage du processus PM2 existant '$PM2_APP_NAME'..."
  sudo -u "$APP_USER" pm2 restart "$PM2_APP_NAME" 2>&1
else
  info "Démarrage du processus PM2..."
  sudo -u "$APP_USER" pm2 start "$APP_DIR/ecosystem.config.cjs"
fi
sudo -u "$APP_USER" pm2 save

# Démarrage automatique au boot
STARTUP_CMD=$(pm2 startup systemd -u "$APP_USER" --hp "/home/$APP_USER" 2>&1 | grep -E "^sudo " || true)
[[ -n "$STARTUP_CMD" ]] && eval "$STARTUP_CMD" || true
ok "PM2 configuré"

# ─────────────────────────────────────────────────────────────────────────────
section "ÉTAPE 8 — Nginx"
# ─────────────────────────────────────────────────────────────────────────────

# SELinux — indispensable sur CentOS pour que Nginx puisse joindre l'API
if command -v setsebool &>/dev/null; then
  setsebool -P httpd_can_network_connect 1 2>/dev/null && \
    ok "SELinux : httpd_can_network_connect activé" || \
    warn "SELinux : échec de setsebool (à faire manuellement)"
fi

if [[ "$NGINX_ALREADY_CONFIGURED" = false ]]; then
  SERVER_NAME="${DOMAIN:-_}"
  STATIC_DIR="$APP_DIR/artifacts/puma-helpdesk/dist"

  # Sauvegarder l'éventuelle config existante avant écrasement
  [[ -f "$NGINX_CONF" ]] && cp "$NGINX_CONF" "${NGINX_CONF}.bak.$(date +%Y%m%d%H%M)" && \
    info "Ancienne config sauvegardée : ${NGINX_CONF}.bak.*"

  cat > "$NGINX_CONF" <<NGINX
# PUMA Helpdesk — généré par deploy.sh le $(date)
# API sur 127.0.0.1:${API_PORT}

upstream puma_api {
  server 127.0.0.1:${API_PORT};
  keepalive 64;
}

server {
  listen ${HTTP_PORT};
  listen [::]:${HTTP_PORT};
  server_name ${SERVER_NAME};

  access_log /var/log/nginx/puma-helpdesk-access.log;
  error_log  /var/log/nginx/puma-helpdesk-error.log;

  root ${STATIC_DIR};
  index index.html;

  gzip on;
  gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript;

  location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
  }

  # Proxy API + SSE (notifications temps réel)
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

  # SPA — toutes les routes vers index.html
  location / {
    try_files \$uri \$uri/ /index.html;
  }
}
NGINX

  nginx -t && systemctl reload nginx && ok "Nginx configuré et rechargé" || warn "Vérifier la configuration Nginx manuellement (nginx -t)"
else
  warn "Config Nginx non modifiée. Vérifiez manuellement que $NGINX_CONF est correct."
fi

# ─────────────────────────────────────────────────────────────────────────────
section "ÉTAPE 9 — Pare-feu (firewalld)"
# ─────────────────────────────────────────────────────────────────────────────

if ! systemctl is-active --quiet firewalld 2>/dev/null; then
  dnf install -y firewalld
  systemctl enable --now firewalld
fi

firewall-cmd --permanent --add-service=ssh    2>/dev/null || true
firewall-cmd --permanent --add-service=http   2>/dev/null || true
firewall-cmd --permanent --add-service=https  2>/dev/null || true
firewall-cmd --reload 2>/dev/null || true
ok "Firewalld : SSH + HTTP + HTTPS autorisés"

# ─────────────────────────────────────────────────────────────────────────────
section "ÉTAPE 10 — SSL Let's Encrypt"
# ─────────────────────────────────────────────────────────────────────────────

if [[ -n "$DOMAIN" ]]; then
  if ! command -v certbot &>/dev/null; then
    dnf install -y epel-release 2>/dev/null || true
    dnf install -y certbot python3-certbot-nginx 2>/dev/null || \
      warn "Certbot indisponible — SSL à configurer manuellement"
  fi
  if command -v certbot &>/dev/null; then
    read -rp "$(echo -e "${YELLOW}Email Let's Encrypt (ex: admin@mondomaine.sn): ${NC}")" LE_EMAIL
    certbot --nginx -n --agree-tos --email "$LE_EMAIL" -d "$DOMAIN" && \
      ok "SSL Let's Encrypt configuré" || warn "Certbot échoué — vérifier le DNS"
    systemctl enable certbot-renew.timer 2>/dev/null || true
  fi
else
  info "Pas de domaine configuré — SSL ignoré (modifiez DOMAIN= dans le script pour l'activer)"
fi

# ─────────────────────────────────────────────────────────────────────────────
section "RÉSUMÉ FINAL"
# ─────────────────────────────────────────────────────────────────────────────

PUBLIC_IP=$(curl -s --max-time 5 ifconfig.me 2>/dev/null || echo "$PRIMARY_IP")

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║         PUMA Helpdesk déployé avec succès !          ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${BLUE}URL de l'application :${NC}"
if [[ -n "$DOMAIN" ]]; then
  echo -e "    ${GREEN}https://$DOMAIN${NC}"
else
  echo -e "    ${GREEN}http://$PUBLIC_IP${NC}"
fi
echo ""
echo -e "  ${BLUE}API interne :${NC}         127.0.0.1:$API_PORT"
echo -e "  ${BLUE}Fichier .env :${NC}        $APP_DIR/.env"
echo -e "  ${BLUE}Config Nginx :${NC}        $NGINX_CONF"
echo -e "  ${BLUE}Logs API :${NC}            sudo -u puma pm2 logs $PM2_APP_NAME"
echo -e "  ${BLUE}Logs Nginx :${NC}          tail -f /var/log/nginx/puma-helpdesk-error.log"
echo ""
echo -e "  ${BLUE}Comptes de démonstration :${NC}"
echo -e "    Admin      : admin@puma.sn  / admin123"
echo -e "    Technicien : tech1@puma.sn  / tech123"
echo -e "    Agent      : agent1@puma.sn / agent123"
echo ""
echo -e "  ${YELLOW}⚠  Changez les mots de passe par défaut avant la mise en production !${NC}"
echo ""
echo -e "  ${BLUE}Commandes utiles :${NC}"
echo -e "    sudo -u puma pm2 status               # état de l'API"
echo -e "    sudo -u puma pm2 restart $PM2_APP_NAME  # redémarrer l'API"
echo -e "    nginx -t && nginx -s reload           # recharger Nginx"
echo -e "    firewall-cmd --list-all               # état du pare-feu"
echo ""
