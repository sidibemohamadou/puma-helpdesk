# Guide de Déploiement VPS — PUMA Helpdesk

## Vue d'ensemble

PUMA Helpdesk est une application full-stack composée de :
- **Frontend** : React + Vite (fichiers statiques servis par Nginx)
- **Backend (API)** : Express 5 + Node.js (géré par PM2 ou Docker)
- **Base de données** : PostgreSQL 16
- **Reverse proxy** : Nginx (HTTP/HTTPS + SSE temps réel)

Le script `deploy.sh` prend en charge **deux modes** :

| Mode | Quand l'utiliser |
|------|-----------------|
| **Docker** | Vous avez un gestionnaire de conteneurs (Docker/Podman) ou voulez éviter tout conflit avec les apps existantes |
| **Natif** | Installation directe sur CentOS sans Docker — Node.js + PM2 + Nginx sur le système |

```bash
# Lancement interactif (le script vous demande le mode)
sudo bash deploy.sh

# Ou directement :
sudo bash deploy.sh --docker    # mode Docker
sudo bash deploy.sh --native    # mode Natif
```

---

## Prérequis VPS

| Composant | Version minimum | Recommandé |
|-----------|----------------|------------|
| OS | CentOS 9 Stream | **CentOS 10 Stream** |
| RAM | 1 Go | 2 Go |
| Disque | 10 Go | 20 Go |
| Node.js | 20.x | 22.x |
| PostgreSQL | 14 | 16 |

---

## Déploiement avec Docker (manuel)

Si vous préférez gérer Docker vous-même sans passer par le script :

### Fichiers fournis

| Fichier | Rôle |
|---------|------|
| `Dockerfile.api` | Build + image production de l'API Node.js |
| `Dockerfile.web` | Build du frontend Vite + image Nginx |
| `docker-compose.yml` | Orchestration des 3 services (db, api, web) |
| `nginx.docker.conf` | Config Nginx interne au conteneur web |
| `.env.docker.example` | Modèle de fichier de variables d'environnement |

### Architecture des conteneurs

```
┌────────────────────────────────────────────────────┐
│  VPS (CentOS 10)                                   │
│                                                    │
│  ┌──────────────────────────────────────────────┐  │
│  │  Docker réseau interne (puma_internal)       │  │
│  │                                              │  │
│  │  [web]     Nginx :80 ──proxy /api──► [api]  │  │
│  │   │         sert dist/              Express  │  │
│  │   │         (statique)              :3001     │  │
│  │   │                                  │       │  │
│  │   └────────────────────────────────► [db]   │  │
│  │                                    Postgres  │  │
│  │                                    :5432     │  │
│  └──────────────────────────────────────────────┘  │
│       Port 80 exposé vers l'extérieur               │
└────────────────────────────────────────────────────┘
```

### Étapes manuelles

```bash
# 1. Installer Docker sur CentOS
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker

# 2. Préparer les variables d'environnement
cp .env.docker.example .env.docker
nano .env.docker
# → Remplir DB_PASSWORD et SESSION_SECRET (openssl rand -base64 64)
# → Modifier HTTP_PORT si le port 80 est déjà utilisé

# 3. Construire et démarrer tous les conteneurs
docker compose --env-file .env.docker up -d --build

# 4. Vérifier que tout tourne
docker compose --env-file .env.docker ps

# 5. (Optionnel) Injecter les données de démonstration
docker compose --env-file .env.docker exec db \
  psql -U puma_user -d puma_helpdesk -c "\dt"
```

### Commandes Docker utiles

```bash
# Statut de tous les conteneurs
docker compose --env-file .env.docker ps

# Logs de l'API en temps réel
docker compose --env-file .env.docker logs -f api

# Logs de Nginx
docker compose --env-file .env.docker logs -f web

# Redémarrer l'API (après mise à jour du code)
docker compose --env-file .env.docker restart api

# Rebuild complet après modification du code
docker compose --env-file .env.docker up -d --build

# Arrêter tout (la base de données est préservée dans le volume pgdata)
docker compose --env-file .env.docker down

# Arrêter ET supprimer les données (reset complet — irréversible)
docker compose --env-file .env.docker down -v

# Accéder à la base de données
docker compose --env-file .env.docker exec db \
  psql -U puma_user -d puma_helpdesk

# Backup de la base de données
docker compose --env-file .env.docker exec db \
  pg_dump -U puma_user puma_helpdesk > backup_$(date +%Y%m%d).sql
```

### Mise à jour de l'application (Docker)

```bash
# Transférer le nouveau code
rsync -avz --exclude='.git' --exclude='node_modules' \
  /chemin/local/ root@VOTRE_IP:/opt/puma-helpdesk/

# Sur le VPS
cd /opt/puma-helpdesk
docker compose --env-file .env.docker up -d --build
```

### Conflit sur le port 80

Si une autre application utilise déjà le port 80, modifiez `HTTP_PORT` dans `.env.docker` :
```env
HTTP_PORT=8080
```
Puis ajoutez une règle firewalld :
```bash
firewall-cmd --permanent --add-port=8080/tcp
firewall-cmd --reload
```

---

## Déploiement automatisé (recommandé)

### Ce que le script vérifie avant de toucher quoi que ce soit

Avant toute installation, le script effectue un **audit complet de l'environnement** :

| Vérification | Comportement |
|---|---|
| **IP principale** | Détectée automatiquement et affichée |
| **Ports 80, 443, 3001–3005** | Inventaire complet avec le nom du processus occupant chaque port |
| **Port API (3001)** | Si occupé, le script teste 3002, 3003… jusqu'à trouver un port libre |
| **Nginx déjà en place** | Demande confirmation avant d'écraser un vhost existant ; sauvegarde automatique du fichier précédent (`.bak.YYYYMMDD`) |
| **Installation PUMA existante** | Passe en mode *mise à jour* : le `.env` et la base de données sont conservés |
| **Base de données existante** | Jamais recréée ni vidée si elle existe déjà |
| **Processus PM2 existant** | Redémarré au lieu d'être recréé |
| **SELinux** | `httpd_can_network_connect` activé automatiquement (évite l'erreur 502) |

Un **récapitulatif interactif** est affiché avant tout changement — vous pouvez annuler.

### Étape 1 : Transférer le code sur le VPS

Depuis votre machine locale :

```bash
# Option A : avec rsync (transfert direct)
rsync -avz --exclude='.git' --exclude='node_modules' --exclude='*/dist' \
  /chemin/vers/puma-helpdesk/ root@VOTRE_IP_VPS:/tmp/puma-source/

# Option B : avec scp (archive)
tar czf puma.tar.gz --exclude='.git' --exclude='node_modules' .
scp puma.tar.gz root@VOTRE_IP_VPS:/tmp/
ssh root@VOTRE_IP_VPS "mkdir -p /tmp/puma-source && tar xzf /tmp/puma.tar.gz -C /tmp/puma-source"

# Option C : avec git
ssh root@VOTRE_IP_VPS "git clone https://votre-repo.git /tmp/puma-source"
```

### Étape 2 : Lancer le script de déploiement

```bash
# Connexion SSH
ssh root@VOTRE_IP_VPS

# Aller dans le dossier source
cd /tmp/puma-source

# (Optionnel) Configurer le domaine dans le script avant de lancer
nano deploy.sh
# Modifier la ligne : DOMAIN="helpdesk.mondomaine.sn"

# Lancer l'installation
bash deploy.sh
```

Le script installe et configure automatiquement :
- Node.js 22, pnpm, PM2
- PostgreSQL 16 via le dépôt officiel PGDG
- Build complet (libs + API + frontend)
- Migrations Drizzle ORM
- Nginx en reverse proxy
- firewalld (pare-feu)
- SSL Let's Encrypt si domaine configuré

---

## Déploiement manuel (étape par étape)

### 1. Installation des dépendances système

```bash
# Mise à jour système
dnf update -y

# Outils de base
dnf install -y curl git wget tar gcc gcc-c++ make openssl rsync
```

### 2. Node.js 22 via NodeSource

```bash
curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -
dnf install -y nodejs

# Vérification
node -v   # doit afficher v22.x.x
npm -v
```

### 3. pnpm et PM2

```bash
npm install -g pnpm@9 pm2

# Vérification
pnpm -v
pm2 -v
```

### 4. Nginx

```bash
dnf install -y nginx
systemctl enable --now nginx
```

### 5. PostgreSQL 16

```bash
# Ajouter le dépôt officiel PGDG (PostgreSQL Global Development Group)
dnf install -y https://download.postgresql.org/pub/repos/yum/reporpms/EL-9-x86_64/pgdg-redhat-repo-latest.noarch.rpm

# Désactiver le module postgresql du dépôt système (évite les conflits)
dnf module disable -y postgresql

# Installer PostgreSQL 16
dnf install -y postgresql16-server postgresql16

# Initialiser et démarrer
postgresql-16-setup --initdb
systemctl enable --now postgresql-16
```

### 6. Configuration PostgreSQL

```bash
# Se connecter en tant que postgres
sudo -u postgres psql

-- Dans le shell PostgreSQL :
CREATE USER puma_user WITH PASSWORD 'MotDePasseFort123!';
CREATE DATABASE puma_helpdesk OWNER puma_user;
GRANT ALL PRIVILEGES ON DATABASE puma_helpdesk TO puma_user;
\q
```

> Par défaut sur CentOS, PostgreSQL n'accepte que les connexions locales via socket Unix.
> La connexion via `localhost` (TCP) peut nécessiter d'ajuster `pg_hba.conf` :

```bash
nano /var/lib/pgsql/16/data/pg_hba.conf

# Ajouter/modifier la ligne pour TCP local :
# host  all  all  127.0.0.1/32  scram-sha-256

# Redémarrer après modification
systemctl restart postgresql-16
```

### 7. Déploiement du code

```bash
# Créer le répertoire applicatif et l'utilisateur dédié
useradd -m -s /bin/bash puma
mkdir -p /opt/puma-helpdesk
chown -R puma:puma /opt/puma-helpdesk

# Copier les sources
rsync -a /tmp/puma-source/ /opt/puma-helpdesk/
chown -R puma:puma /opt/puma-helpdesk
```

### 8. Variables d'environnement

```bash
nano /opt/puma-helpdesk/.env
```

Contenu du fichier `.env` :

```env
NODE_ENV=production
PORT=3001

# Connexion PostgreSQL
DATABASE_URL=postgresql://puma_user:MotDePasseFort123!@localhost:5432/puma_helpdesk

# Clé secrète de session (générer avec : openssl rand -base64 64)
SESSION_SECRET=votre_cle_secrete_tres_longue_ici
```

```bash
# Restreindre les permissions
chmod 600 /opt/puma-helpdesk/.env
chown puma:puma /opt/puma-helpdesk/.env
```

> ⚠️ Ne jamais versionner ce fichier dans Git.

### 9. Installation des dépendances et build

```bash
sudo -u puma bash -c "cd /opt/puma-helpdesk && pnpm install --frozen-lockfile"

# Build des librairies partagées
sudo -u puma bash -c "cd /opt/puma-helpdesk && pnpm --filter './lib/**' run build"

# Build de l'API Express
sudo -u puma bash -c "cd /opt/puma-helpdesk && pnpm --filter @workspace/api-server run build"

# Build du frontend React/Vite (produit des fichiers statiques)
sudo -u puma bash -c "cd /opt/puma-helpdesk && pnpm --filter @workspace/puma-helpdesk run build"
```

### 10. Migrations de base de données

```bash
sudo -u puma bash -c "
  cd /opt/puma-helpdesk/lib/db
  source /opt/puma-helpdesk/.env
  pnpm run push-force
"
```

Données de démonstration (optionnel, première installation uniquement) :

```bash
sudo -u puma bash -c "
  cd /opt/puma-helpdesk/lib/db
  source /opt/puma-helpdesk/.env
  pnpm run seed
"
```

### 11. Démarrage de l'API avec PM2

```bash
# Créer le répertoire de logs
mkdir -p /var/log/puma-helpdesk
chown -R puma:puma /var/log/puma-helpdesk

# Créer le fichier de configuration PM2
cat > /opt/puma-helpdesk/ecosystem.config.cjs <<'EOF'
module.exports = {
  apps: [{
    name: 'puma-api',
    script: './dist/index.mjs',
    cwd: '/opt/puma-helpdesk/artifacts/api-server',
    instances: 1,
    exec_mode: 'fork',
    env_file: '/opt/puma-helpdesk/.env',
    env: {
      NODE_ENV: 'production',
      PORT: '3001',
    },
    log_file: '/var/log/puma-helpdesk/api.log',
    error_file: '/var/log/puma-helpdesk/api-error.log',
    time: true,
    restart_delay: 3000,
    max_restarts: 10,
  }]
};
EOF
chown puma:puma /opt/puma-helpdesk/ecosystem.config.cjs

# Démarrer l'application
sudo -u puma pm2 start /opt/puma-helpdesk/ecosystem.config.cjs
sudo -u puma pm2 save

# Configurer le démarrage automatique au boot
pm2 startup systemd -u puma --hp /home/puma
# Exécuter la commande sudo affichée par PM2
```

### 12. Configuration Nginx

Sur CentOS, les vhosts vont dans `/etc/nginx/conf.d/` :

```bash
nano /etc/nginx/conf.d/puma-helpdesk.conf
```

```nginx
upstream puma_api {
  server 127.0.0.1:3001;
  keepalive 64;
}

server {
  listen 80;
  listen [::]:80;
  server_name helpdesk.mondomaine.sn;   # ou _ pour accepter toutes les requêtes

  access_log /var/log/nginx/puma-helpdesk-access.log;
  error_log  /var/log/nginx/puma-helpdesk-error.log;

  # Fichiers statiques du frontend
  root /opt/puma-helpdesk/artifacts/puma-helpdesk/dist;
  index index.html;

  # Compression Gzip
  gzip on;
  gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript;

  # Cache des assets compilés
  location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
  }

  # Proxy vers l'API (incluant SSE temps réel)
  location /api/ {
    proxy_pass         http://puma_api;
    proxy_http_version 1.1;
    proxy_set_header   Host              $host;
    proxy_set_header   X-Real-IP         $remote_addr;
    proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header   X-Forwarded-Proto $scheme;
    proxy_set_header   Connection        '';
    proxy_buffering    off;       # Obligatoire pour SSE (notifications temps réel)
    proxy_cache        off;
    proxy_read_timeout 3600s;    # Long timeout pour SSE
    proxy_send_timeout 3600s;
    chunked_transfer_encoding on;
  }

  # SPA — rediriger toutes les routes vers index.html
  location / {
    try_files $uri $uri/ /index.html;
  }
}
```

```bash
# Vérifier et recharger Nginx
nginx -t && systemctl reload nginx
```

### 13. SELinux (spécifique CentOS)

SELinux est activé par défaut sur CentOS et peut bloquer Nginx.

```bash
# Autoriser Nginx à contacter l'API (port 3001)
setsebool -P httpd_can_network_connect 1

# Vérification
getsebool httpd_can_network_connect
```

> Si Nginx renvoie une erreur `502 Bad Gateway`, c'est probablement SELinux.
> La commande ci-dessus règle le problème de façon permanente.

### 14. Pare-feu firewalld

```bash
systemctl enable --now firewalld

firewall-cmd --permanent --add-service=ssh
firewall-cmd --permanent --add-service=http
firewall-cmd --permanent --add-service=https
firewall-cmd --reload

# Vérification
firewall-cmd --list-all
```

### 15. SSL avec Let's Encrypt

> Le DNS de votre domaine doit déjà pointer vers l'IP du VPS.

```bash
# Installation certbot
dnf install -y epel-release
dnf install -y certbot python3-certbot-nginx

# Obtenir le certificat
certbot --nginx -d helpdesk.mondomaine.sn \
  --email admin@mondomaine.sn \
  --agree-tos --non-interactive

# Renouvellement automatique
systemctl enable --now certbot-renew.timer
```

---

## Mise à jour de l'application

```bash
# 1. Transférer les nouvelles sources
rsync -avz --exclude='.git' --exclude='node_modules' --exclude='*/dist' \
  /chemin/local/puma-helpdesk/ root@VOTRE_IP:/opt/puma-helpdesk/

# 2. Sur le VPS — réinstaller et rebuilder
sudo -u puma bash -c "cd /opt/puma-helpdesk && pnpm install --frozen-lockfile"
sudo -u puma bash -c "cd /opt/puma-helpdesk && pnpm --filter './lib/**' run build"
sudo -u puma bash -c "cd /opt/puma-helpdesk && pnpm --filter @workspace/api-server run build"
sudo -u puma bash -c "cd /opt/puma-helpdesk && pnpm --filter @workspace/puma-helpdesk run build"

# 3. Migrations si le schéma a changé
sudo -u puma bash -c "cd /opt/puma-helpdesk/lib/db && source /opt/puma-helpdesk/.env && pnpm run push-force"

# 4. Redémarrer l'API
sudo -u puma pm2 restart puma-api

# 5. Recharger Nginx (les assets statiques sont déjà en place)
nginx -s reload
```

---

## Commandes utiles

```bash
# Statut de l'API
sudo -u puma pm2 status

# Logs de l'API en temps réel
sudo -u puma pm2 logs puma-api

# Redémarrer l'API
sudo -u puma pm2 restart puma-api

# Statut Nginx
systemctl status nginx
nginx -t

# Logs Nginx
tail -f /var/log/nginx/puma-helpdesk-error.log

# Statut PostgreSQL
systemctl status postgresql-16

# Connexion à la base de données
sudo -u postgres psql puma_helpdesk

# Backup de la base de données
sudo -u postgres pg_dump puma_helpdesk > backup_$(date +%Y%m%d_%H%M).sql

# Vérifier le pare-feu
firewall-cmd --list-all

# Vérifier SELinux
getenforce
getsebool httpd_can_network_connect
```

---

## Comptes par défaut (à changer en production)

| Rôle | Email | Mot de passe |
|------|-------|-------------|
| Administrateur | admin@puma.sn | admin123 |
| Technicien 1 | tech1@puma.sn | tech123 |
| Technicien 2 | tech2@puma.sn | tech123 |
| Agent 1 | agent1@puma.sn | agent123 |
| Agent 2 | agent2@puma.sn | agent123 |
| Agent 3 | agent3@puma.sn | agent123 |

> ⚠️ **Changez tous les mots de passe via Administrateur → Gestion des utilisateurs avant la mise en production.**

---

## Dépannage

### Erreur 502 Bad Gateway (Nginx → API)

**Cause probable : SELinux bloque Nginx**

```bash
# Solution immédiate
setsebool -P httpd_can_network_connect 1
# Vérifier les logs d'audit
grep nginx /var/log/audit/audit.log | tail -20
```

### L'API ne démarre pas

```bash
sudo -u puma pm2 logs puma-api --lines 50
# Vérifier la connexion à la base de données
psql "$DATABASE_URL" -c "SELECT 1"
# Vérifier le fichier .env
cat /opt/puma-helpdesk/.env
```

### Le frontend affiche une page blanche

```bash
# Vérifier que le build existe
ls /opt/puma-helpdesk/artifacts/puma-helpdesk/dist/
# Vérifier la config Nginx
nginx -t
```

### Les notifications SSE ne fonctionnent pas

Vérifier la configuration Nginx :
- `proxy_buffering off;` doit être présent dans le bloc `/api/`
- `proxy_read_timeout` doit être ≥ 3600s
- Aucun CDN ou proxy intermédiaire ne coupe les connexions longues

### PostgreSQL ne démarre pas

```bash
# Vérifier si la base est initialisée
ls /var/lib/pgsql/16/data/
# Réinitialiser si vide
postgresql-16-setup --initdb
systemctl start postgresql-16
journalctl -u postgresql-16 -n 50
```

### Connexion PostgreSQL refusée (TCP)

```bash
# Éditer pg_hba.conf
nano /var/lib/pgsql/16/data/pg_hba.conf
# Ajouter : host  all  all  127.0.0.1/32  scram-sha-256
systemctl restart postgresql-16
```
