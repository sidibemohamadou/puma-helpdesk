#!/usr/bin/env bash
# ===========================================================================
# PUMA Helpdesk — Reset & Déploiement complet depuis zéro
# Usage : bash reset-deploy.sh
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

[[ $EUID -ne 0 ]] && echo "Exécutez en root : sudo bash reset-deploy.sh" && exit 1

PRIMARY_IP=$(ip route get 1.1.1.1 2>/dev/null | awk '{print $7; exit}' || hostname -I | awk '{print $1}')

echo ""
echo -e "${CYAN}${BOLD}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}${BOLD}║      PUMA Helpdesk — Reset & Déploiement complet    ║${NC}"
echo -e "${CYAN}${BOLD}╠══════════════════════════════════════════════════════╣${NC}"
echo -e "${CYAN}${BOLD}║${NC}  Serveur : ${GREEN}$PRIMARY_IP${NC}"
echo -e "${CYAN}${BOLD}╚══════════════════════════════════════════════════════╝${NC}"
echo ""

# ─────────────────────────────────────────────────────────────────────────────
section "1/6 — Nettoyage complet (anciens conteneurs + volumes)"
# ─────────────────────────────────────────────────────────────────────────────

if [[ -d "$INSTALL_DIR" ]]; then
  info "Arrêt et suppression des anciens conteneurs et volumes..."
  cd "$INSTALL_DIR"
  docker compose down -v --remove-orphans 2>/dev/null || true
  cd /tmp
fi
ok "Nettoyage terminé"

# ─────────────────────────────────────────────────────────────────────────────
section "2/6 — Correction DNS Docker"
# ─────────────────────────────────────────────────────────────────────────────

mkdir -p /etc/docker
if ! grep -q "8.8.8.8" /etc/docker/daemon.json 2>/dev/null; then
  printf '{\n  "dns": ["8.8.8.8", "8.8.4.4"]\n}\n' > /etc/docker/daemon.json
  systemctl restart docker
  ok "DNS Docker corrigé → 8.8.8.8"
else
  ok "DNS Docker déjà configuré"
fi

# ─────────────────────────────────────────────────────────────────────────────
section "3/6 — Détection du port disponible"
# ─────────────────────────────────────────────────────────────────────────────

HTTP_PORT=80
for p in 80 8080 8090 8000 3000; do
  if ! ss -tlnp 2>/dev/null | grep -q ":${p} "; then
    HTTP_PORT=$p
    break
  fi
done

if [[ "$HTTP_PORT" != "80" ]]; then
  warn "Port 80 occupé → utilisation du port $HTTP_PORT"
fi
ok "Port sélectionné : $HTTP_PORT"

# ─────────────────────────────────────────────────────────────────────────────
section "4/6 — Clonage depuis GitHub"
# ─────────────────────────────────────────────────────────────────────────────

rm -rf "$INSTALL_DIR"
git clone --branch "$REPO_BRANCH" "$REPO_URL" "$INSTALL_DIR"
cd "$INSTALL_DIR"
ok "Dépôt cloné dans $INSTALL_DIR"

# ─────────────────────────────────────────────────────────────────────────────
section "5/6 — Génération de la configuration"
# ─────────────────────────────────────────────────────────────────────────────

DB_PASS=$(cat /dev/urandom | tr -dc 'A-Za-z0-9' 2>/dev/null | head -c 20; echo)
SESSION_SEC=$(cat /dev/urandom | tr -dc 'a-z0-9' 2>/dev/null | head -c 48; echo)
DB_URL="postgresql://puma_user:${DB_PASS}@db:5432/puma_helpdesk"

cat > "$INSTALL_DIR/.env.prod" << EOF
DB_NAME=puma_helpdesk
DB_USER=puma_user
DB_PASSWORD=${DB_PASS}
SESSION_SECRET=${SESSION_SEC}
HTTP_PORT=${HTTP_PORT}
DATABASE_URL=${DB_URL}
EOF
chmod 600 "$INSTALL_DIR/.env.prod"
ok "Fichier .env.prod créé"

# Script SQL d'initialisation (schéma + données de démo)
mkdir -p "$INSTALL_DIR/docker-init"
cat > "$INSTALL_DIR/docker-init/01-schema.sql" << 'SQLEOF'
-- Enums
CREATE TYPE role AS ENUM ('agent', 'technician', 'admin');
CREATE TYPE category AS ENUM ('network', 'hardware', 'software', 'security', 'other');
CREATE TYPE priority AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE status AS ENUM ('open', 'in_progress', 'pending', 'resolved', 'closed');
CREATE TYPE notification_type AS ENUM ('new_ticket', 'ticket_assigned', 'status_changed', 'comment_added');

-- Table users
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          role NOT NULL DEFAULT 'agent',
  department    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table tickets
CREATE TABLE IF NOT EXISTS tickets (
  id            SERIAL PRIMARY KEY,
  title         TEXT NOT NULL,
  description   TEXT NOT NULL,
  category      category NOT NULL,
  priority      priority NOT NULL,
  status        status NOT NULL DEFAULT 'open',
  created_by_id INTEGER NOT NULL REFERENCES users(id),
  assignee_id   INTEGER REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at   TIMESTAMPTZ
);

-- Table comments
CREATE TABLE IF NOT EXISTS comments (
  id          SERIAL PRIMARY KEY,
  ticket_id   INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  author_id   INTEGER NOT NULL REFERENCES users(id),
  content     TEXT NOT NULL,
  is_internal BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table notifications
CREATE TABLE IF NOT EXISTS notifications (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ticket_id  INTEGER REFERENCES tickets(id) ON DELETE CASCADE,
  type       notification_type NOT NULL,
  message    TEXT NOT NULL,
  is_read    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table activity_log
CREATE TABLE IF NOT EXISTS activity_log (
  id         SERIAL PRIMARY KEY,
  ticket_id  INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  actor_id   INTEGER REFERENCES users(id),
  action     TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Données de démonstration (mots de passe : SHA256(mdp + "puma_salt_2024"))
INSERT INTO users (email, name, password_hash, role, department) VALUES
  ('admin@puma.sn',  'Administrateur PUMA', '80719fd837da3350b186266365eb5bf88a020ebece225af5aab9bd9b5fe81474', 'admin',      'Direction'),
  ('tech1@puma.sn',  'Technicien Alpha',    'd84495afdcf66ed193fc2c5b316cf2ce0836fa051bf04ace6e867976ac8f2b30', 'technician', 'Informatique'),
  ('tech2@puma.sn',  'Technicien Beta',     'd84495afdcf66ed193fc2c5b316cf2ce0836fa051bf04ace6e867976ac8f2b30', 'technician', 'Informatique'),
  ('agent1@puma.sn', 'Agent Dakar',         '52c241a4b4773bcaba46e883d89d28a5886669864efa73466cd90b7228d54ae1', 'agent',      'Dakar'),
  ('agent2@puma.sn', 'Agent Ziguinchor',    '52c241a4b4773bcaba46e883d89d28a5886669864efa73466cd90b7228d54ae1', 'agent',      'Ziguinchor'),
  ('agent3@puma.sn', 'Agent Saint-Louis',   '52c241a4b4773bcaba46e883d89d28a5886669864efa73466cd90b7228d54ae1', 'agent',      'Saint-Louis')
ON CONFLICT (email) DO NOTHING;
SQLEOF

ok "Script SQL d'initialisation créé"

# docker-compose.yml propre (sans migrate, sans version)
cat > "$INSTALL_DIR/docker-compose.yml" << COMPOSEEOF
services:

  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB:       puma_helpdesk
      POSTGRES_USER:     puma_user
      POSTGRES_PASSWORD: ${DB_PASS}
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ${INSTALL_DIR}/docker-init:/docker-entrypoint-initdb.d:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U puma_user -d puma_helpdesk"]
      interval: 5s
      timeout: 5s
      retries: 15
      start_period: 10s
    networks:
      - puma_internal

  api:
    build:
      context: .
      dockerfile: Dockerfile.api
      network: host
    restart: unless-stopped
    environment:
      NODE_ENV:       production
      PORT:           3001
      DATABASE_URL:   ${DB_URL}
      SESSION_SECRET: ${SESSION_SEC}
    depends_on:
      db:
        condition: service_healthy
    networks:
      - puma_internal

  web:
    build:
      context: .
      dockerfile: Dockerfile.web
      network: host
    restart: unless-stopped
    ports:
      - "${HTTP_PORT}:80"
    depends_on:
      - api
    networks:
      - puma_internal

volumes:
  pgdata:
    driver: local

networks:
  puma_internal:
    driver: bridge
COMPOSEEOF

ok "docker-compose.yml généré (sans service migrate)"

# ─────────────────────────────────────────────────────────────────────────────
section "6/6 — Build et démarrage"
# ─────────────────────────────────────────────────────────────────────────────

cd "$INSTALL_DIR"
info "Build des images (3-5 minutes)..."
docker compose build

info "Démarrage des conteneurs..."
docker compose up -d

info "Attente que la base de données soit prête..."
sleep 15

echo ""
docker compose ps

# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}${BOLD}║           Déploiement terminé avec succès !         ║${NC}"
echo -e "${GREEN}${BOLD}╠══════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}${BOLD}║${NC}  URL : ${BOLD}http://${PRIMARY_IP}:${HTTP_PORT}${NC}"
echo -e "${GREEN}${BOLD}║${NC}"
echo -e "${GREEN}${BOLD}║${NC}  Comptes :"
echo -e "${GREEN}${BOLD}║${NC}    Admin      : admin@puma.sn  / admin123"
echo -e "${GREEN}${BOLD}║${NC}    Technicien : tech1@puma.sn  / tech123"
echo -e "${GREEN}${BOLD}║${NC}    Agent      : agent1@puma.sn / agent123"
echo -e "${GREEN}${BOLD}║${NC}"
echo -e "${GREEN}${BOLD}║${NC}  Logs : docker compose -C $INSTALL_DIR logs -f"
echo -e "${GREEN}${BOLD}╚══════════════════════════════════════════════════════╝${NC}"
echo ""
