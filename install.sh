#!/usr/bin/env bash
# ===========================================================================
# PUMA Helpdesk — Script d'installation automatique
# Usage : curl -fsSL https://raw.githubusercontent.com/sidibemohamadou/puma-helpdesk/main/install.sh | bash
#      ou : bash install.sh
# ===========================================================================
set -euo pipefail

REPO_URL="https://github.com/sidibemohamadou/puma-helpdesk.git"
REPO_BRANCH="main"
INSTALL_DIR="/opt/puma-helpdesk"
ENV_FILE="$INSTALL_DIR/.env.prod"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

info()    { echo -e "${BLUE}[INFO]${NC} $*"; }
ok()      { echo -e "${GREEN}[✓]${NC} $*"; }
warn()    { echo -e "${YELLOW}[!]${NC} $*"; }
error()   { echo -e "${RED}[✗] ERREUR :${NC} $*"; exit 1; }
section() { echo -e "\n${CYAN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; echo -e "${CYAN}${BOLD}  $*${NC}"; echo -e "${CYAN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; }

# ── Root check ───────────────────────────────────────────────────────────────
[[ $EUID -ne 0 ]] && error "Exécutez en tant que root : sudo bash install.sh"

# ── IP principale ────────────────────────────────────────────────────────────
PRIMARY_IP=$(ip route get 1.1.1.1 2>/dev/null | awk '{print $7; exit}' || hostname -I | awk '{print $1}')

# ── Générateur de mot de passe sécurisé ─────────────────────────────────────
gen_password() { tr -dc 'A-Za-z0-9!@#%^&*' </dev/urandom | head -c 24; }
gen_secret()   { tr -dc 'a-z0-9' </dev/urandom | head -c 48; }

# ── Vérification de port libre ───────────────────────────────────────────────
port_free() { ! ss -tlnp 2>/dev/null | grep -q ":${1} "; }

find_free_port() {
  local candidates=("$@")
  for p in "${candidates[@]}"; do
    if port_free "$p"; then echo "$p"; return 0; fi
  done
  error "Aucun port disponible parmi : ${candidates[*]}"
}

# ─────────────────────────────────────────────────────────────────────────────
echo -e ""
echo -e "${CYAN}${BOLD}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}${BOLD}║        PUMA Helpdesk — Installation automatique     ║${NC}"
echo -e "${CYAN}${BOLD}╠══════════════════════════════════════════════════════╣${NC}"
echo -e "${CYAN}${BOLD}║${NC}  Serveur : ${GREEN}$PRIMARY_IP${NC}"
echo -e "${CYAN}${BOLD}║${NC}  Dépôt   : ${GREEN}$REPO_URL${NC}"
echo -e "${CYAN}${BOLD}╚══════════════════════════════════════════════════════╝${NC}"
echo ""

# ─────────────────────────────────────────────────────────────────────────────
section "1/6 — Vérification et installation de Docker"
# ─────────────────────────────────────────────────────────────────────────────

if command -v docker &>/dev/null; then
  ok "Docker déjà installé : $(docker --version)"
else
  info "Installation de Docker..."
  if command -v dnf &>/dev/null; then
    dnf install -y dnf-plugins-core
    dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
    dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
  elif command -v apt-get &>/dev/null; then
    apt-get update -qq
    apt-get install -y ca-certificates curl gnupg lsb-release
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" > /etc/apt/sources.list.d/docker.list
    apt-get update -qq
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
  else
    error "Gestionnaire de paquets non reconnu (ni dnf ni apt)"
  fi
  systemctl enable --now docker
  ok "Docker installé avec succès"
fi

if ! command -v docker compose &>/dev/null 2>&1 && ! docker compose version &>/dev/null 2>&1; then
  info "Installation du plugin docker compose..."
  if command -v dnf &>/dev/null; then
    dnf install -y docker-compose-plugin
  else
    apt-get install -y docker-compose-plugin
  fi
fi
ok "docker compose disponible"

# ─────────────────────────────────────────────────────────────────────────────
section "2/6 — Correction DNS Docker (évite les erreurs EAI_AGAIN)"
# ─────────────────────────────────────────────────────────────────────────────

DAEMON_FILE="/etc/docker/daemon.json"
DNS_NEEDED=false

if [[ ! -f "$DAEMON_FILE" ]]; then
  DNS_NEEDED=true
elif ! grep -q "8.8.8.8" "$DAEMON_FILE"; then
  DNS_NEEDED=true
fi

if $DNS_NEEDED; then
  info "Configuration du DNS Docker → 8.8.8.8 / 8.8.4.4"
  mkdir -p /etc/docker
  cat > "$DAEMON_FILE" << 'DAEMON_EOF'
{
  "dns": ["8.8.8.8", "8.8.4.4"]
}
DAEMON_EOF
  systemctl restart docker
  ok "DNS Docker configuré et Docker redémarré"
else
  ok "DNS Docker déjà configuré"
fi

# ─────────────────────────────────────────────────────────────────────────────
section "3/6 — Détection des ports disponibles"
# ─────────────────────────────────────────────────────────────────────────────

HTTP_PORT=$(find_free_port 80 8080 8090 8000 3000)
ok "Port web disponible : ${GREEN}$HTTP_PORT${NC}"

if ! port_free 80 && [[ "$HTTP_PORT" != "80" ]]; then
  warn "Le port 80 est occupé → utilisation du port $HTTP_PORT"
  PORT_80_OWNER=$(ss -tlnp | grep ':80 ' | grep -oP '"[^"]+"' | head -1 | tr -d '"' || echo "inconnu")
  warn "Port 80 utilisé par : $PORT_80_OWNER"
fi

# Vérifier nginx sur le système hôte
if systemctl is-active --quiet nginx 2>/dev/null; then
  warn "Nginx système détecté et actif"
  if [[ "$HTTP_PORT" == "80" ]]; then
    warn "Nginx occupe le port 80 → recherche d'un port alternatif"
    HTTP_PORT=$(find_free_port 8080 8090 8000 3000)
    warn "Port alternatif sélectionné : $HTTP_PORT"
    warn "Conseil : arrêtez nginx système (systemctl stop nginx) pour libérer le port 80"
  fi
fi

ok "Configuration des ports terminée"

# ─────────────────────────────────────────────────────────────────────────────
section "4/6 — Clonage / mise à jour du dépôt GitHub"
# ─────────────────────────────────────────────────────────────────────────────

if [[ -d "$INSTALL_DIR/.git" ]]; then
  info "Dépôt existant détecté → mise à jour..."
  cd "$INSTALL_DIR"
  git fetch origin
  git reset --hard "origin/$REPO_BRANCH"
  ok "Code mis à jour depuis GitHub"
else
  info "Clonage du dépôt dans $INSTALL_DIR..."
  rm -rf "$INSTALL_DIR"
  git clone --branch "$REPO_BRANCH" "$REPO_URL" "$INSTALL_DIR"
  ok "Dépôt cloné avec succès"
fi

cd "$INSTALL_DIR"

# ─────────────────────────────────────────────────────────────────────────────
section "5/6 — Configuration de l'environnement"
# ─────────────────────────────────────────────────────────────────────────────

if [[ -f "$ENV_FILE" ]]; then
  warn "Fichier .env.prod existant conservé (pas de réinitialisation des mots de passe)"
  source "$ENV_FILE" 2>/dev/null || true
else
  info "Génération des secrets sécurisés..."
  DB_PASS=$(gen_password)
  SESSION_SEC=$(gen_secret)
  cat > "$ENV_FILE" << EOF
DB_NAME=puma_helpdesk
DB_USER=puma_user
DB_PASSWORD=${DB_PASS}
SESSION_SECRET=${SESSION_SEC}
HTTP_PORT=${HTTP_PORT}
EOF
  chmod 600 "$ENV_FILE"
  ok "Fichier .env.prod créé avec des secrets sécurisés"
fi

# Mettre à jour le port au cas où il aurait changé
sed -i "s|^HTTP_PORT=.*|HTTP_PORT=${HTTP_PORT}|" "$ENV_FILE"

# ─────────────────────────────────────────────────────────────────────────────
section "6/6 — Build et démarrage des conteneurs"
# ─────────────────────────────────────────────────────────────────────────────

info "Arrêt des conteneurs existants (si présents)..."
docker compose --env-file "$ENV_FILE" down --remove-orphans 2>/dev/null || true

info "Build et démarrage des conteneurs (peut prendre 3-5 minutes)..."
docker compose --env-file "$ENV_FILE" up -d --build

info "Attente que les services soient prêts..."
sleep 10

# Vérification du statut
echo ""
docker compose --env-file "$ENV_FILE" ps

# Vérification santé API
MAX_WAIT=60
ELAPSED=0
info "Vérification de l'API..."
while [[ $ELAPSED -lt $MAX_WAIT ]]; do
  if docker compose --env-file "$ENV_FILE" exec -T api wget -qO- http://localhost:3001/api/health &>/dev/null 2>&1; then
    break
  fi
  sleep 5
  ELAPSED=$((ELAPSED + 5))
done

# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}${BOLD}║           Installation terminée avec succès !       ║${NC}"
echo -e "${GREEN}${BOLD}╠══════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}${BOLD}║${NC}  URL d'accès : ${BOLD}http://${PRIMARY_IP}:${HTTP_PORT}${NC}"
echo -e "${GREEN}${BOLD}║${NC}"
echo -e "${GREEN}${BOLD}║${NC}  Comptes de connexion :"
echo -e "${GREEN}${BOLD}║${NC}    Admin      : admin@puma.sn      / admin123"
echo -e "${GREEN}${BOLD}║${NC}    Technicien : tech1@puma.sn      / tech123"
echo -e "${GREEN}${BOLD}║${NC}    Agent      : agent1@puma.sn     / agent123"
echo -e "${GREEN}${BOLD}║${NC}"
echo -e "${GREEN}${BOLD}║${NC}  Commandes utiles :"
echo -e "${GREEN}${BOLD}║${NC}    Logs    : docker compose --env-file $ENV_FILE logs -f"
echo -e "${GREEN}${BOLD}║${NC}    Statut  : docker compose --env-file $ENV_FILE ps"
echo -e "${GREEN}${BOLD}║${NC}    Arrêter : docker compose --env-file $ENV_FILE down"
echo -e "${GREEN}${BOLD}║${NC}    Mise à jour : bash $INSTALL_DIR/install.sh"
echo -e "${GREEN}${BOLD}╚══════════════════════════════════════════════════════╝${NC}"
echo ""
