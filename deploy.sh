#!/usr/bin/env bash
# ===========================================================================
# Script de déploiement — PUMA Helpdesk
# Plateforme : CentOS 10 Stream / RHEL 10 / AlmaLinux / Rocky Linux
# Usage      : sudo bash deploy.sh [--docker | --native]
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

# ── Vérifications préliminaires ───────────────────────────────────────────────
[[ $EUID -ne 0 ]] && error "Ce script doit être exécuté en tant que root (sudo bash deploy.sh)"
command -v dnf &>/dev/null || error "dnf introuvable — ce script est prévu pour CentOS/RHEL/AlmaLinux/Rocky"

# ── Détection de l'IP principale ─────────────────────────────────────────────
PRIMARY_IP=$(ip route get 1.1.1.1 2>/dev/null | awk '{print $7; exit}' || hostname -I | awk '{print $1}')

# ── Fonctions utilitaires ─────────────────────────────────────────────────────
port_is_free() { ! ss -tlnp 2>/dev/null | grep -qE ":${1}\b"; }
port_owner()   { ss -tlnp 2>/dev/null | grep -E ":${1}\b" | grep -oP 'users:\(\(".*?"\)' | head -1 | grep -oP '".*?"' | head -1 | tr -d '"' || echo "inconnu"; }

# ─────────────────────────────────────────────────────────────────────────────
# SÉLECTION DU MODE DE DÉPLOIEMENT
# ─────────────────────────────────────────────────────────────────────────────

DEPLOY_MODE=""

# Argument CLI : --docker ou --native
for arg in "$@"; do
  case "$arg" in
    --docker) DEPLOY_MODE="docker" ;;
    --native) DEPLOY_MODE="native" ;;
  esac
done

if [[ -z "$DEPLOY_MODE" ]]; then
  echo ""
  echo -e "${CYAN}╔══════════════════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║           PUMA Helpdesk — Déploiement               ║${NC}"
  echo -e "${CYAN}╠══════════════════════════════════════════════════════╣${NC}"
  echo -e "${CYAN}║${NC}  IP principale : ${GREEN}$PRIMARY_IP${NC}"
  echo -e "${CYAN}║${NC}"
  echo -e "${CYAN}║${NC}  Choisissez le mode de déploiement :"
  echo -e "${CYAN}║${NC}"
  echo -e "${CYAN}║${NC}    ${GREEN}[1] Docker${NC}  (recommandé si Docker est installé)"
  echo -e "${CYAN}║${NC}        → Conteneurs isolés, PostgreSQL inclus,"
  echo -e "${CYAN}║${NC}          aucun conflit avec les apps existantes"
  echo -e "${CYAN}║${NC}"
  echo -e "${CYAN}║${NC}    ${YELLOW}[2] Natif${NC}   (installation directe sur CentOS)"
  echo -e "${CYAN}║${NC}        → Node.js + PostgreSQL + Nginx + PM2"
  echo -e "${CYAN}║${NC}          directement sur le système"
  echo -e "${CYAN}╚══════════════════════════════════════════════════════╝${NC}"
  echo ""
  read -rp "$(echo -e "${YELLOW}Votre choix [1/2] : ${NC}")" MODE_CHOICE
  case "${MODE_CHOICE:-1}" in
    1) DEPLOY_MODE="docker" ;;
    2) DEPLOY_MODE="native" ;;
    *) error "Choix invalide. Relancez le script et choisissez 1 ou 2." ;;
  esac
fi

# =============================================================================
# MODE DOCKER
# =============================================================================
if [[ "$DEPLOY_MODE" == "docker" ]]; then

  section "MODE DOCKER — Vérification de l'environnement"

  # ── Inventaire des ports ────────────────────────────────────────────────────
  echo ""
  info "Inventaire des ports actifs sur $PRIMARY_IP :"
  echo -e "  ${CYAN}PORT   STATUT    PROCESSUS${NC}"
  for p in 80 443 5432; do
    if port_is_free "$p"; then
      echo -e "  ${p}     ${GREEN}libre${NC}"
    else
      echo -e "  ${p}     ${RED}occupé${NC}   → $(port_owner "$p")"
    fi
  done
  echo ""

  # ── Sélection du port HTTP ──────────────────────────────────────────────────
  HTTP_PORT=80
  if ! port_is_free 80; then
    warn "Le port 80 est occupé par : $(port_owner 80)"
    for candidate in 8080 8081 8082 8083; do
      if port_is_free "$candidate"; then
        HTTP_PORT="$candidate"
        warn "Port HTTP alternatif sélectionné : $HTTP_PORT"
        break
      fi
    done
    [[ "$HTTP_PORT" == "80" ]] && error "Aucun port HTTP libre (80, 8080-8083). Libérez un port et relancez."
  fi

  # ── Détection installation Docker existante ─────────────────────────────────
  DOCKER_MODE="fresh"
  COMPOSE_FILE_EXISTS=false
  if [[ -f "/opt/puma-helpdesk/.env.docker" ]]; then
    DOCKER_MODE="update"
    info "Installation Docker PUMA existante détectée → mode mise à jour"
  fi
  [[ -f "/opt/puma-helpdesk/docker-compose.yml" ]] && COMPOSE_FILE_EXISTS=true

  # ── Récapitulatif ───────────────────────────────────────────────────────────
  echo -e "${CYAN}┌─────────────────────────────────────────────────────┐${NC}"
  echo -e "${CYAN}│  Résumé du déploiement Docker                       │${NC}"
  echo -e "${CYAN}├─────────────────────────────────────────────────────┤${NC}"
  echo -e "${CYAN}│${NC}  IP principale   : ${GREEN}$PRIMARY_IP${NC}"
  echo -e "${CYAN}│${NC}  Port HTTP exposé: ${GREEN}$HTTP_PORT${NC}"
  echo -e "${CYAN}│${NC}  Répertoire app  : ${GREEN}/opt/puma-helpdesk${NC}"
  echo -e "${CYAN}│${NC}  Mode            : $([ "$DOCKER_MODE" = "fresh" ] && echo "${GREEN}Nouvelle installation${NC}" || echo "${YELLOW}Mise à jour${NC}")"
  echo -e "${CYAN}│${NC}  PostgreSQL      : conteneur isolé (port interne uniquement)"
  echo -e "${CYAN}└─────────────────────────────────────────────────────┘${NC}"
  echo ""
  read -rp "$(echo -e "${YELLOW}Lancer le déploiement Docker ? [O/n] ${NC}")" GO_DOCKER
  [[ "${GO_DOCKER:-O}" =~ ^[Nn]$ ]] && { info "Annulé."; exit 0; }

  section "MODE DOCKER — Installation de Docker"

  # ── Installer Docker ────────────────────────────────────────────────────────
  if ! command -v docker &>/dev/null; then
    info "Installation de Docker via le dépôt officiel..."
    dnf install -y -q curl
    curl -fsSL https://get.docker.com | sh
    systemctl enable --now docker
    ok "Docker $(docker --version | cut -d' ' -f3 | tr -d ',') installé"
  else
    ok "Docker déjà installé : $(docker --version | cut -d' ' -f3 | tr -d ',')"
    systemctl enable --now docker
  fi

  # ── Plugin docker compose (v2) ──────────────────────────────────────────────
  if ! docker compose version &>/dev/null; then
    info "Installation du plugin Docker Compose v2..."
    dnf install -y -q docker-compose-plugin 2>/dev/null || \
      curl -SL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64" \
        -o /usr/local/lib/docker/cli-plugins/docker-compose && \
      chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
  fi
  ok "Docker Compose $(docker compose version --short) disponible"

  section "MODE DOCKER — Préparation du code"

  mkdir -p /opt/puma-helpdesk
  info "Copie des sources (le .env.docker existant est préservé)..."
  rsync -a --delete \
    --exclude=".git" \
    --exclude="node_modules" \
    --exclude="*/node_modules" \
    --exclude="*/dist" \
    --exclude=".local" \
    --exclude=".env.docker" \
    "$(pwd)/" /opt/puma-helpdesk/

  section "MODE DOCKER — Configuration des variables d'environnement"

  ENV_FILE="/opt/puma-helpdesk/.env.docker"

  if [[ "$DOCKER_MODE" == "fresh" ]]; then
    DB_PASSWORD=$(openssl rand -base64 32 | tr -d '/+=' | head -c 30)
    SESSION_SECRET=$(openssl rand -base64 64 | tr -d '\n')

    cat > "$ENV_FILE" <<EOF
# PUMA Helpdesk — Variables Docker (généré le $(date))
DB_NAME=puma_helpdesk
DB_USER=puma_user
DB_PASSWORD=$DB_PASSWORD
SESSION_SECRET=$SESSION_SECRET
HTTP_PORT=$HTTP_PORT
EOF
    chmod 600 "$ENV_FILE"
    ok ".env.docker généré avec des secrets aléatoires"
  else
    # Mettre à jour uniquement le port HTTP si différent
    sed -i "s/^HTTP_PORT=.*/HTTP_PORT=$HTTP_PORT/" "$ENV_FILE"
    ok ".env.docker existant conservé"
  fi

  section "MODE DOCKER — Build et démarrage des conteneurs"

  cd /opt/puma-helpdesk

  info "Build des images Docker (cela peut prendre 3-5 minutes)..."
  docker compose --env-file "$ENV_FILE" build --parallel 2>&1

  info "Démarrage des conteneurs..."
  docker compose --env-file "$ENV_FILE" up -d 2>&1

  # ── Attendre que la DB soit prête ──────────────────────────────────────────
  info "Attente de la base de données..."
  for i in $(seq 1 30); do
    docker compose --env-file "$ENV_FILE" exec -T db \
      pg_isready -U puma_user -d puma_helpdesk &>/dev/null && break
    sleep 2
  done

  # ── Seed au premier déploiement ────────────────────────────────────────────
  if [[ "$DOCKER_MODE" == "fresh" ]]; then
    read -rp "$(echo -e "${YELLOW}Injecter les données de démonstration ? [o/N] ${NC}")" SEED_DOCKER
    if [[ "${SEED_DOCKER:-N}" =~ ^[Oo]$ ]]; then
      docker compose --env-file "$ENV_FILE" exec api \
        node -e "
          const { execSync } = require('child_process');
          execSync('cd /workspace && pnpm --filter @workspace/db run seed', { stdio: 'inherit' });
        " 2>&1 || warn "Seed non disponible dans le conteneur (données à créer via l'interface admin)"
    fi
  fi

  section "MODE DOCKER — Pare-feu (firewalld)"

  if ! systemctl is-active --quiet firewalld 2>/dev/null; then
    dnf install -y -q firewalld && systemctl enable --now firewalld
  fi
  firewall-cmd --permanent --add-service=ssh   2>/dev/null || true
  firewall-cmd --permanent --add-service=http  2>/dev/null || true
  firewall-cmd --permanent --add-service=https 2>/dev/null || true
  [[ "$HTTP_PORT" != "80" ]] && firewall-cmd --permanent --add-port="${HTTP_PORT}/tcp" 2>/dev/null || true
  firewall-cmd --reload 2>/dev/null || true
  ok "Firewalld configuré"

  PUBLIC_IP=$(curl -s --max-time 5 ifconfig.me 2>/dev/null || echo "$PRIMARY_IP")

  echo ""
  echo -e "${GREEN}╔══════════════════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║     PUMA Helpdesk (Docker) déployé avec succès !    ║${NC}"
  echo -e "${GREEN}╚══════════════════════════════════════════════════════╝${NC}"
  echo ""
  echo -e "  ${BLUE}URL :${NC} ${GREEN}http://$PUBLIC_IP${[[ "$HTTP_PORT" != "80" ]] && echo ":$HTTP_PORT" || echo ""}${NC}"
  echo ""
  echo -e "  ${BLUE}Comptes de démonstration :${NC}"
  echo -e "    Admin      : admin@puma.sn  / admin123"
  echo -e "    Technicien : tech1@puma.sn  / tech123"
  echo -e "    Agent      : agent1@puma.sn / agent123"
  echo ""
  echo -e "  ${BLUE}Fichier .env.docker :${NC} $ENV_FILE"
  echo ""
  echo -e "  ${BLUE}Commandes utiles :${NC}"
  echo -e "    cd /opt/puma-helpdesk"
  echo -e "    docker compose --env-file .env.docker ps         # statut"
  echo -e "    docker compose --env-file .env.docker logs -f api  # logs API"
  echo -e "    docker compose --env-file .env.docker restart api  # redémarrer API"
  echo -e "    docker compose --env-file .env.docker down          # arrêter tout"
  echo ""
  echo -e "  ${YELLOW}⚠  Changez les mots de passe par défaut via l'interface Admin !${NC}"
  echo ""
  exit 0
fi

# =============================================================================
# MODE NATIF (installation directe sur CentOS)
# =============================================================================

# ── Configuration ──────────────────────────────────────────────────────────────
APP_DIR="/opt/puma-helpdesk"
APP_USER="puma"
DOMAIN=""              # ex: helpdesk.mondomaine.sn (laisser vide pour IP seule)
DB_NAME="puma_helpdesk"
DB_USER="puma_user"
NODE_VERSION="22"
NGINX_CONF="/etc/nginx/conf.d/puma-helpdesk.conf"
PM2_APP_NAME="puma-api"

section "MODE NATIF — Analyse de l'environnement existant"

info "Adresse IP principale : ${GREEN}$PRIMARY_IP${NC}"

# ── Inventaire des ports ──────────────────────────────────────────────────────
echo ""
info "Inventaire des ports actifs sur $PRIMARY_IP :"
echo -e "  ${CYAN}PORT   STATUT    PROCESSUS${NC}"
for p in 80 443 3000 3001 3002 3003 3004 5432 5433; do
  if port_is_free "$p"; then
    echo -e "  ${p}     ${GREEN}libre${NC}"
  else
    echo -e "  ${p}     ${RED}occupé${NC}   → $(port_owner "$p")"
  fi
done
echo ""

# ── Sélection automatique du port API ────────────────────────────────────────
API_PORT=""
for candidate in 3001 3002 3003 3004 3005; do
  if port_is_free "$candidate"; then
    API_PORT="$candidate"; break
  fi
done
[[ -z "$API_PORT" ]] && error "Aucun port libre entre 3001 et 3005. Libérez un port et relancez."
info "Port API sélectionné : ${GREEN}$API_PORT${NC}"

# ── Vérification port 80 ──────────────────────────────────────────────────────
HTTP_PORT=80
if ! port_is_free 80; then
  HTTP_OWNER=$(port_owner 80)
  warn "Le port 80 est déjà utilisé par : $HTTP_OWNER"
  if ! echo "$HTTP_OWNER" | grep -qi "nginx"; then
    read -rp "$(echo -e "${YELLOW}Continuer quand même ? [o/N] ${NC}")" CONT
    [[ "${CONT:-N}" =~ ^[Oo]$ ]] || error "Déploiement annulé."
  fi
fi

# ── Vérification Nginx existant ───────────────────────────────────────────────
NGINX_ALREADY_CONFIGURED=false
if [[ -f "$NGINX_CONF" ]]; then
  warn "Une configuration Nginx PUMA Helpdesk existe déjà : $NGINX_CONF"
  read -rp "$(echo -e "${YELLOW}Écraser la configuration Nginx existante ? [o/N] ${NC}")" OVERWRITE_NGINX
  [[ "${OVERWRITE_NGINX:-N}" =~ ^[Oo]$ ]] || { NGINX_ALREADY_CONFIGURED=true; warn "Config Nginx inchangée."; }
fi

# ── Vérification installation existante ──────────────────────────────────────
FRESH_INSTALL=true
if [[ -d "$APP_DIR" ]] && [[ -f "$APP_DIR/.env" ]]; then
  FRESH_INSTALL=false
  info "Installation PUMA existante → mode mise à jour (.env conservé)"
  EXISTING_PORT=$(grep -E "^PORT=" "$APP_DIR/.env" 2>/dev/null | cut -d= -f2 || echo "")
  if [[ -n "$EXISTING_PORT" ]]; then
    API_PORT="$EXISTING_PORT"
    info "Port API conservé depuis .env existant : $API_PORT"
  fi
fi

# ── Vérification PM2 ─────────────────────────────────────────────────────────
PM2_EXISTS=false
if command -v pm2 &>/dev/null && sudo -u "${APP_USER}" pm2 list 2>/dev/null | grep -q "$PM2_APP_NAME" 2>/dev/null; then
  PM2_EXISTS=true
  info "Processus PM2 '$PM2_APP_NAME' existant → sera redémarré"
fi

# ── Vérification PostgreSQL ───────────────────────────────────────────────────
DB_EXISTS=false
PG_SYS_USER="postgres"
if systemctl is-active --quiet postgresql 2>/dev/null || systemctl is-active --quiet postgresql-16 2>/dev/null; then
  sudo -u "$PG_SYS_USER" psql -lqt 2>/dev/null | cut -d\| -f1 | grep -qw "$DB_NAME" && DB_EXISTS=true
fi

# ── Récapitulatif ─────────────────────────────────────────────────────────────
echo -e "${CYAN}┌─────────────────────────────────────────────────────┐${NC}"
echo -e "${CYAN}│  Résumé du déploiement natif                        │${NC}"
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
read -rp "$(echo -e "${YELLOW}Lancer le déploiement natif ? [O/n] ${NC}")" GO
[[ "${GO:-O}" =~ ^[Nn]$ ]] && { info "Annulé."; exit 0; }

section "MODE NATIF — Dépendances système"

dnf update -y -q
dnf install -y -q curl git wget tar gcc gcc-c++ make openssl rsync iproute

# Node.js
if ! command -v node &>/dev/null || [[ "$(node -v | sed 's/v//' | cut -d. -f1)" -lt "$NODE_VERSION" ]]; then
  curl -fsSL "https://rpm.nodesource.com/setup_${NODE_VERSION}.x" | bash - >/dev/null 2>&1
  dnf install -y nodejs
fi
ok "Node.js $(node -v)"

command -v pnpm &>/dev/null || npm install -g pnpm@9
ok "pnpm $(pnpm -v)"
command -v pm2 &>/dev/null || npm install -g pm2
ok "PM2 installé"

if ! command -v nginx &>/dev/null; then dnf install -y nginx; fi
systemctl enable nginx
ok "Nginx disponible"

section "MODE NATIF — PostgreSQL"

PG_RUNNING=false
for svc in postgresql postgresql-16; do
  systemctl is-active --quiet "$svc" 2>/dev/null && { PG_RUNNING=true; break; }
done

if [[ "$PG_RUNNING" = false ]]; then
  if ! rpm -q pgdg-redhat-repo &>/dev/null; then
    dnf install -y "https://download.postgresql.org/pub/repos/yum/reporpms/EL-9-x86_64/pgdg-redhat-repo-latest.noarch.rpm" 2>/dev/null || true
    dnf module disable -y postgresql 2>/dev/null || true
  fi
  dnf install -y postgresql16-server postgresql16 2>/dev/null || dnf install -y postgresql-server postgresql 2>/dev/null || error "Impossible d'installer PostgreSQL"
  PG_SETUP=$(command -v postgresql-16-setup 2>/dev/null || command -v postgresql-setup 2>/dev/null || echo "")
  [[ -n "$PG_SETUP" ]] && $PG_SETUP --initdb 2>/dev/null || true
  systemctl enable postgresql-16 2>/dev/null || systemctl enable postgresql 2>/dev/null
  systemctl start  postgresql-16 2>/dev/null || systemctl start  postgresql 2>/dev/null
  sleep 3
  ok "PostgreSQL installé et démarré"
else
  ok "PostgreSQL déjà actif"
fi

if [[ "$DB_EXISTS" = false ]]; then
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
  ok "Base de données '$DB_NAME' créée"
  DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@localhost:5432/${DB_NAME}"
else
  DATABASE_URL=$(grep -E "^DATABASE_URL=" "$APP_DIR/.env" 2>/dev/null | cut -d= -f2- || "")
  if [[ -z "$DATABASE_URL" ]]; then
    read -rp "$(echo -e "${YELLOW}Mot de passe PostgreSQL pour '$DB_USER': ${NC}")" DB_PASSWORD
    DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@localhost:5432/${DB_NAME}"
  else
    info "Connexion DB conservée depuis .env existant"
  fi
  ok "Base de données conservée"
fi

section "MODE NATIF — Déploiement du code"

! id "$APP_USER" &>/dev/null && useradd -m -s /bin/bash "$APP_USER" && ok "Utilisateur '$APP_USER' créé"
mkdir -p "$APP_DIR"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

info "Copie du code source (le .env existant est préservé)..."
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

if [[ "$FRESH_INSTALL" = true ]]; then
  SESSION_SECRET=$(openssl rand -base64 64 | tr -d '\n')
  cat > "$APP_DIR/.env" <<EOF
NODE_ENV=production
PORT=$API_PORT
DATABASE_URL=$DATABASE_URL
SESSION_SECRET=$SESSION_SECRET
EOF
  chmod 600 "$APP_DIR/.env"
  chown "$APP_USER:$APP_USER" "$APP_DIR/.env"
  ok ".env créé"
else
  sed -i "s/^PORT=.*/PORT=$API_PORT/" "$APP_DIR/.env"
  ok ".env existant conservé (PORT mis à jour si besoin)"
fi

section "MODE NATIF — Build"

sudo -u "$APP_USER" bash -c "cd '$APP_DIR' && pnpm install --frozen-lockfile 2>&1"
ok "Dépendances installées"
sudo -u "$APP_USER" bash -c "cd '$APP_DIR' && pnpm --filter './lib/**' run build 2>&1"
sudo -u "$APP_USER" bash -c "cd '$APP_DIR' && pnpm --filter @workspace/api-server run build 2>&1"
sudo -u "$APP_USER" bash -c "cd '$APP_DIR' && pnpm --filter @workspace/puma-helpdesk run build 2>&1"
ok "Build terminé"

section "MODE NATIF — Migrations"

sudo -u "$APP_USER" bash -c "set -a; source '$APP_DIR/.env'; set +a; cd '$APP_DIR/lib/db' && pnpm run push-force 2>&1"
ok "Migrations appliquées"

if [[ "$FRESH_INSTALL" = true ]]; then
  read -rp "$(echo -e "${YELLOW}Injecter les données de démonstration ? [o/N] ${NC}")" SEED_CONFIRM
  [[ "${SEED_CONFIRM:-N}" =~ ^[Oo]$ ]] && \
    sudo -u "$APP_USER" bash -c "set -a; source '$APP_DIR/.env'; set +a; cd '$APP_DIR/lib/db' && pnpm run seed 2>&1" && \
    ok "Données injectées" || true
fi

section "MODE NATIF — PM2"

mkdir -p /var/log/puma-helpdesk && chown -R "$APP_USER:$APP_USER" /var/log/puma-helpdesk

cat > "$APP_DIR/ecosystem.config.cjs" <<EOF
module.exports = {
  apps: [{
    name: '$PM2_APP_NAME',
    script: './dist/index.mjs',
    cwd: '$APP_DIR/artifacts/api-server',
    instances: 1,
    exec_mode: 'fork',
    env_file: '$APP_DIR/.env',
    env: { NODE_ENV: 'production', PORT: '$API_PORT' },
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
  sudo -u "$APP_USER" pm2 restart "$PM2_APP_NAME" 2>&1
else
  sudo -u "$APP_USER" pm2 start "$APP_DIR/ecosystem.config.cjs"
fi
sudo -u "$APP_USER" pm2 save
STARTUP_CMD=$(pm2 startup systemd -u "$APP_USER" --hp "/home/$APP_USER" 2>&1 | grep -E "^sudo " || true)
[[ -n "$STARTUP_CMD" ]] && eval "$STARTUP_CMD" || true
ok "PM2 configuré"

section "MODE NATIF — Nginx"

command -v setsebool &>/dev/null && setsebool -P httpd_can_network_connect 1 2>/dev/null && ok "SELinux : httpd_can_network_connect activé"

if [[ "$NGINX_ALREADY_CONFIGURED" = false ]]; then
  [[ -f "$NGINX_CONF" ]] && cp "$NGINX_CONF" "${NGINX_CONF}.bak.$(date +%Y%m%d%H%M)" && info "Ancienne config sauvegardée"
  cat > "$NGINX_CONF" <<NGINX
upstream puma_api {
  server 127.0.0.1:${API_PORT};
  keepalive 64;
}
server {
  listen ${HTTP_PORT};
  listen [::]:${HTTP_PORT};
  server_name ${DOMAIN:-_};
  access_log /var/log/nginx/puma-helpdesk-access.log;
  error_log  /var/log/nginx/puma-helpdesk-error.log;
  root $APP_DIR/artifacts/puma-helpdesk/dist;
  index index.html;
  gzip on;
  gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript;
  location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
  }
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
  location / {
    try_files \$uri \$uri/ /index.html;
  }
}
NGINX
  nginx -t && systemctl reload nginx && ok "Nginx configuré"
fi

section "MODE NATIF — Pare-feu (firewalld)"

! systemctl is-active --quiet firewalld 2>/dev/null && { dnf install -y -q firewalld; systemctl enable --now firewalld; }
firewall-cmd --permanent --add-service=ssh   2>/dev/null || true
firewall-cmd --permanent --add-service=http  2>/dev/null || true
firewall-cmd --permanent --add-service=https 2>/dev/null || true
firewall-cmd --reload 2>/dev/null || true
ok "Firewalld configuré"

[[ -n "$DOMAIN" ]] && command -v certbot &>/dev/null && {
  read -rp "$(echo -e "${YELLOW}Email Let's Encrypt: ${NC}")" LE_EMAIL
  certbot --nginx -n --agree-tos --email "$LE_EMAIL" -d "$DOMAIN" && ok "SSL Let's Encrypt configuré"
}

PUBLIC_IP=$(curl -s --max-time 5 ifconfig.me 2>/dev/null || echo "$PRIMARY_IP")

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║       PUMA Helpdesk (Natif) déployé avec succès !   ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${BLUE}URL :${NC} ${GREEN}http://$PUBLIC_IP${NC}"
echo ""
echo -e "  ${BLUE}Comptes :${NC}  admin@puma.sn/admin123  |  tech1@puma.sn/tech123  |  agent1@puma.sn/agent123"
echo -e "  ${BLUE}.env   :${NC}  $APP_DIR/.env"
echo -e "  ${BLUE}Logs   :${NC}  sudo -u puma pm2 logs $PM2_APP_NAME"
echo ""
echo -e "  ${YELLOW}⚠  Changez les mots de passe par défaut en production !${NC}"
echo ""
