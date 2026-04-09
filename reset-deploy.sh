#!/usr/bin/env bash
# ===========================================================================
# PUMA Helpdesk — Reset & Déploiement complet depuis zéro
# Usage : curl -fsSL https://raw.githubusercontent.com/sidibemohamadou/puma-helpdesk/main/reset-deploy.sh | bash
# ===========================================================================
set -euo pipefail

INSTALL_DIR="/opt/puma-helpdesk"
REPO_URL="https://github.com/sidibemohamadou/puma-helpdesk.git"
REPO_BRANCH="main"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

info()    { echo -e "${BLUE}[INFO]${NC} $*"; }
ok()      { echo -e "${GREEN}[✓]${NC} $*"; }
warn()    { echo -e "${YELLOW}[!]${NC} $*"; }
section() { echo -e "\n${CYAN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; echo -e "${CYAN}${BOLD}  $*${NC}"; echo -e "${CYAN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; }
port_free() { ! ss -tlnp 2>/dev/null | grep -q ":${1} "; }

[[ $EUID -ne 0 ]] && echo "Exécutez en root : sudo bash reset-deploy.sh" && exit 1

PRIMARY_IP=$(ip route get 1.1.1.1 2>/dev/null | awk '{print $7; exit}' || hostname -I | awk '{print $1}')

echo ""
echo -e "${CYAN}${BOLD}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}${BOLD}║      PUMA Helpdesk — Déploiement automatique        ║${NC}"
echo -e "${CYAN}${BOLD}╠══════════════════════════════════════════════════════╣${NC}"
echo -e "${CYAN}${BOLD}║${NC}  Serveur : ${GREEN}$PRIMARY_IP${NC}"
echo -e "${CYAN}${BOLD}╚══════════════════════════════════════════════════════╝${NC}"
echo ""

# ─────────────────────────────────────────────────────────────────────────────
section "1/7 — Nettoyage complet"
# ─────────────────────────────────────────────────────────────────────────────
if [[ -d "$INSTALL_DIR" ]]; then
  cd "$INSTALL_DIR"
  docker compose down -v --remove-orphans 2>/dev/null || true
  cd /tmp
fi
rm -rf "$INSTALL_DIR"
ok "Nettoyage terminé"

# ─────────────────────────────────────────────────────────────────────────────
section "2/7 — Correction DNS Docker"
# ─────────────────────────────────────────────────────────────────────────────
mkdir -p /etc/docker
if ! grep -q "8.8.8.8" /etc/docker/daemon.json 2>/dev/null; then
  printf '{\n  "dns": ["8.8.8.8", "8.8.4.4"]\n}\n' > /etc/docker/daemon.json
  systemctl restart docker
  ok "DNS Docker corrigé → 8.8.8.8 / 8.8.4.4"
else
  ok "DNS Docker déjà configuré"
fi

# ─────────────────────────────────────────────────────────────────────────────
section "3/7 — Détection des ports"
# ─────────────────────────────────────────────────────────────────────────────

# Port interne Docker (jamais exposé directement à l'extérieur)
DOCKER_PORT=8181
for p in 8181 8182 8183 8184 8185 8186 8187 8188 8189 8190; do
  if port_free "$p"; then DOCKER_PORT=$p; break; fi
done
ok "Port interne Docker : $DOCKER_PORT"

# nginx système détecté ?
NGINX_ACTIVE=false
if systemctl is-active --quiet nginx 2>/dev/null; then
  NGINX_ACTIVE=true
  ok "Nginx système détecté → proxy port 80 → $DOCKER_PORT"
else
  ok "Pas de nginx système → Docker exposé directement sur port 80"
  if ! port_free 80; then
    warn "Port 80 occupé par un autre processus — Docker utilisera $DOCKER_PORT"
  else
    DOCKER_PORT=80
  fi
fi

# ─────────────────────────────────────────────────────────────────────────────
section "4/7 — Clonage depuis GitHub"
# ─────────────────────────────────────────────────────────────────────────────
git clone --branch "$REPO_BRANCH" "$REPO_URL" "$INSTALL_DIR"
cd "$INSTALL_DIR"
ok "Dépôt cloné dans $INSTALL_DIR"

# ─────────────────────────────────────────────────────────────────────────────
section "5/7 — Génération de la configuration"
# ─────────────────────────────────────────────────────────────────────────────

DB_PASS=$(tr -dc 'A-Za-z0-9' </dev/urandom 2>/dev/null | head -c 20; echo)
SESSION_SEC=$(tr -dc 'a-z0-9' </dev/urandom 2>/dev/null | head -c 48; echo)
DB_URL="postgresql://puma_user:${DB_PASS}@db:5432/puma_helpdesk"

cat > "$INSTALL_DIR/.env.prod" << EOF
DB_NAME=puma_helpdesk
DB_USER=puma_user
DB_PASSWORD=${DB_PASS}
SESSION_SECRET=${SESSION_SEC}
HTTP_PORT=${DOCKER_PORT}
DATABASE_URL=${DB_URL}
EOF
chmod 600 "$INSTALL_DIR/.env.prod"
ok "Fichier .env.prod créé"

# SQL : schéma + données de démo
mkdir -p "$INSTALL_DIR/docker-init"
cat > "$INSTALL_DIR/docker-init/01-schema.sql" << 'SQLEOF'
CREATE TYPE role AS ENUM ('agent', 'technician', 'admin');
CREATE TYPE category AS ENUM ('network', 'hardware', 'software', 'security', 'other');
CREATE TYPE priority AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE status AS ENUM ('open', 'in_progress', 'pending', 'resolved', 'closed');
CREATE TYPE notification_type AS ENUM ('new_ticket', 'ticket_assigned', 'status_changed', 'comment_added');

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
  password_hash TEXT NOT NULL, role role NOT NULL DEFAULT 'agent',
  department TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS tickets (
  id SERIAL PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL,
  category category NOT NULL, priority priority NOT NULL,
  status status NOT NULL DEFAULT 'open',
  created_by_id INTEGER NOT NULL REFERENCES users(id),
  assignee_id INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), resolved_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS comments (
  id SERIAL PRIMARY KEY, ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  author_id INTEGER NOT NULL REFERENCES users(id), content TEXT NOT NULL,
  is_internal BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ticket_id INTEGER REFERENCES tickets(id) ON DELETE CASCADE,
  type notification_type NOT NULL, message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS activity_log (
  id SERIAL PRIMARY KEY, ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  actor_id INTEGER REFERENCES users(id), action TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO users (email, name, password_hash, role, department) VALUES
  ('admin@puma.sn',  'Administrateur PUMA', '80719fd837da3350b186266365eb5bf88a020ebece225af5aab9bd9b5fe81474', 'admin',      'Direction'),
  ('tech1@puma.sn',  'Technicien Alpha',    'd84495afdcf66ed193fc2c5b316cf2ce0836fa051bf04ace6e867976ac8f2b30', 'technician', 'Informatique'),
  ('tech2@puma.sn',  'Technicien Beta',     'd84495afdcf66ed193fc2c5b316cf2ce0836fa051bf04ace6e867976ac8f2b30', 'technician', 'Informatique'),
  ('agent1@puma.sn', 'Agent Dakar',         '52c241a4b4773bcaba46e883d89d28a5886669864efa73466cd90b7228d54ae1', 'agent',      'Dakar'),
  ('agent2@puma.sn', 'Agent Ziguinchor',    '52c241a4b4773bcaba46e883d89d28a5886669864efa73466cd90b7228d54ae1', 'agent',      'Ziguinchor'),
  ('agent3@puma.sn', 'Agent Saint-Louis',   '52c241a4b4773bcaba46e883d89d28a5886669864efa73466cd90b7228d54ae1', 'agent',      'Saint-Louis')
ON CONFLICT (email) DO NOTHING;
SQLEOF
ok "Script SQL créé (schéma + 6 comptes de démo)"

# docker-compose.yml propre
cat > "$INSTALL_DIR/docker-compose.yml" << COMPOSEEOF
services:
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: puma_helpdesk
      POSTGRES_USER: puma_user
      POSTGRES_PASSWORD: "${DB_PASS}"
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ${INSTALL_DIR}/docker-init:/docker-entrypoint-initdb.d:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U puma_user -d puma_helpdesk"]
      interval: 5s
      timeout: 5s
      retries: 15
      start_period: 10s
    networks: [puma_internal]

  api:
    build:
      context: .
      dockerfile: Dockerfile.api
      network: host
    restart: unless-stopped
    environment:
      NODE_ENV: production
      PORT: "3001"
      DATABASE_URL: "${DB_URL}"
      SESSION_SECRET: "${SESSION_SEC}"
    depends_on:
      db:
        condition: service_healthy
    networks: [puma_internal]

  web:
    build:
      context: .
      dockerfile: Dockerfile.web
      network: host
    restart: unless-stopped
    ports:
      - "${DOCKER_PORT}:80"
    depends_on: [api]
    networks: [puma_internal]

volumes:
  pgdata:
networks:
  puma_internal:
    driver: bridge
COMPOSEEOF
ok "docker-compose.yml généré"

# ─────────────────────────────────────────────────────────────────────────────
section "6/7 — Build et démarrage des conteneurs"
# ─────────────────────────────────────────────────────────────────────────────
cd "$INSTALL_DIR"
info "Build en cours (3-5 minutes)..."
docker compose build 2>&1

info "Démarrage des conteneurs..."
docker compose up -d

info "Attente que tous les services soient prêts..."
sleep 20

echo ""
docker compose ps

# ─────────────────────────────────────────────────────────────────────────────
section "7/7 — Configuration nginx système"
# ─────────────────────────────────────────────────────────────────────────────

if $NGINX_ACTIVE; then
  info "Configuration de nginx comme proxy vers PUMA (port 80 → $DOCKER_PORT)..."

  # Réécrire nginx.conf sans le bloc server par défaut
  cat > /etc/nginx/nginx.conf << 'NGINXEOF'
user nginx;
worker_processes auto;
error_log /var/log/nginx/error.log notice;
pid /run/nginx.pid;
include /usr/share/nginx/modules/*.conf;
events {
    worker_connections 1024;
}
http {
    log_format main '$remote_addr - $remote_user [$time_local] "$request" $status $body_bytes_sent';
    access_log /var/log/nginx/access.log main;
    sendfile on;
    tcp_nopush on;
    keepalive_timeout 65;
    types_hash_max_size 4096;
    include /etc/nginx/mime.types;
    default_type application/octet-stream;
    include /etc/nginx/conf.d/*.conf;
}
NGINXEOF

  # Supprimer tous les anciens configs et créer le proxy
  rm -f /etc/nginx/conf.d/*.conf
  cat > /etc/nginx/conf.d/puma.conf << NGINXPROXY
server {
    listen 80 default_server;
    server_name _;
    location / {
        proxy_pass         http://127.0.0.1:${DOCKER_PORT};
        proxy_http_version 1.1;
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header   Connection '';
        proxy_buffering    off;
        proxy_read_timeout 3600s;
    }
}
NGINXPROXY

  nginx -t && systemctl reload nginx
  ok "Nginx configuré → proxy port 80 vers PUMA"
  ACCESS_URL="http://${PRIMARY_IP}"
else
  ACCESS_URL="http://${PRIMARY_IP}:${DOCKER_PORT}"
fi

# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}${BOLD}║        PUMA Helpdesk déployé avec succès !          ║${NC}"
echo -e "${GREEN}${BOLD}╠══════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}${BOLD}║${NC}  ${BOLD}→ ${ACCESS_URL}${NC}"
echo -e "${GREEN}${BOLD}║${NC}"
echo -e "${GREEN}${BOLD}║${NC}  Comptes :"
echo -e "${GREEN}${BOLD}║${NC}    Admin      : admin@puma.sn  / admin123"
echo -e "${GREEN}${BOLD}║${NC}    Technicien : tech1@puma.sn  / tech123"
echo -e "${GREEN}${BOLD}║${NC}    Agent      : agent1@puma.sn / agent123"
echo -e "${GREEN}${BOLD}║${NC}"
echo -e "${GREEN}${BOLD}║${NC}  Logs  : cd ${INSTALL_DIR} && docker compose logs -f"
echo -e "${GREEN}${BOLD}║${NC}  MAJ   : curl -fsSL ${REPO_URL/github.com/raw.githubusercontent.com}/main/reset-deploy.sh | bash"
echo -e "${GREEN}${BOLD}╚══════════════════════════════════════════════════════╝${NC}"
echo ""
