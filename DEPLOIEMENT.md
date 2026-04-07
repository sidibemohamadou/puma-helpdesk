# Guide de Déploiement VPS — PUMA Helpdesk

## Vue d'ensemble

PUMA Helpdesk est une application full-stack composée de :
- **Frontend** : React + Vite (fichiers statiques servis par Nginx)
- **Backend (API)** : Express 5 + Node.js (géré par PM2)
- **Base de données** : PostgreSQL
- **Reverse proxy** : Nginx (HTTP/HTTPS + SSE temps réel)

---

## Prérequis VPS

| Composant | Version minimum | Recommandé |
|-----------|----------------|------------|
| OS | Ubuntu 20.04 / Debian 11 | Ubuntu 22.04 |
| RAM | 1 Go | 2 Go |
| Disque | 10 Go | 20 Go |
| Node.js | 20.x | 22.x |
| PostgreSQL | 14 | 16 |

---

## Déploiement automatisé (recommandé)

### Étape 1 : Transférer le code sur le VPS

Depuis votre machine locale :

```bash
# Option A : avec rsync (transfert direct)
rsync -avz --exclude='.git' --exclude='node_modules' --exclude='*/dist' \
  /chemin/vers/puma-helpdesk/ user@VOTRE_IP_VPS:/tmp/puma-source/

# Option B : avec git (si dépôt Git hébergé)
ssh user@VOTRE_IP_VPS "git clone https://votre-repo.git /tmp/puma-source"
```

### Étape 2 : Lancer le script de déploiement

```bash
# Connexion SSH
ssh user@VOTRE_IP_VPS

# Aller dans le dossier source
cd /tmp/puma-source

# (Optionnel) Configurer le domaine dans le script
nano deploy.sh
# Modifier DOMAIN="helpdesk.mondomaine.sn"

# Lancer l'installation
sudo bash deploy.sh
```

Le script installe et configure automatiquement :
- Node.js 22, pnpm, PM2
- PostgreSQL + création de la base de données
- Build complet (libs + API + frontend)
- Migrations Drizzle ORM
- Nginx en reverse proxy
- UFW (pare-feu)
- SSL Let's Encrypt (si domaine configuré)

---

## Déploiement manuel (étape par étape)

### 1. Installation des dépendances système

```bash
sudo apt-get update && sudo apt-get upgrade -y
sudo apt-get install -y curl git build-essential nginx postgresql postgresql-contrib certbot python3-certbot-nginx ufw

# Node.js 22 via NodeSource
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash -
sudo apt-get install -y nodejs

# pnpm
sudo npm install -g pnpm@9 pm2
```

### 2. Configuration PostgreSQL

```bash
sudo systemctl enable --now postgresql
sudo -u postgres psql

-- Dans le shell PostgreSQL :
CREATE USER puma_user WITH PASSWORD 'MotDePasseFort123!';
CREATE DATABASE puma_helpdesk OWNER puma_user;
GRANT ALL PRIVILEGES ON DATABASE puma_helpdesk TO puma_user;
\q
```

### 3. Déploiement du code

```bash
# Créer le répertoire applicatif
sudo mkdir -p /opt/puma-helpdesk
sudo useradd -m -s /bin/bash puma
sudo chown -R puma:puma /opt/puma-helpdesk

# Copier les sources
sudo rsync -a /tmp/puma-source/ /opt/puma-helpdesk/
sudo chown -R puma:puma /opt/puma-helpdesk
```

### 4. Variables d'environnement

```bash
sudo -u puma nano /opt/puma-helpdesk/.env
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

> ⚠️ **Sécurité** : le fichier `.env` ne doit jamais être versionné dans Git.
> Permissions recommandées : `chmod 600 /opt/puma-helpdesk/.env`

### 5. Installation des dépendances et build

```bash
sudo -u puma bash -c "cd /opt/puma-helpdesk && pnpm install --frozen-lockfile"

# Build des librairies partagées
sudo -u puma bash -c "cd /opt/puma-helpdesk && pnpm --filter './lib/**' run build"

# Build de l'API
sudo -u puma bash -c "cd /opt/puma-helpdesk && pnpm --filter @workspace/api-server run build"

# Build du frontend (fichiers statiques)
sudo -u puma bash -c "cd /opt/puma-helpdesk && pnpm --filter @workspace/puma-helpdesk run build"
```

### 6. Migrations de base de données

```bash
sudo -u puma bash -c "
  cd /opt/puma-helpdesk/lib/db
  source /opt/puma-helpdesk/.env
  pnpm run push-force
"
```

Pour les données de démonstration (optionnel, première installation) :

```bash
sudo -u puma bash -c "
  cd /opt/puma-helpdesk/lib/db
  source /opt/puma-helpdesk/.env
  pnpm run seed
"
```

### 7. Démarrage de l'API avec PM2

Créer le fichier de configuration PM2 :

```bash
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

mkdir -p /var/log/puma-helpdesk
chown -R puma:puma /var/log/puma-helpdesk

# Démarrer
sudo -u puma pm2 start /opt/puma-helpdesk/ecosystem.config.cjs
sudo -u puma pm2 save

# Démarrage automatique au boot
sudo pm2 startup systemd -u puma --hp /home/puma
# Exécuter la commande affichée par PM2
```

### 8. Configuration Nginx

```bash
sudo nano /etc/nginx/sites-available/puma-helpdesk
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
    proxy_buffering    off;       # Obligatoire pour SSE
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
sudo ln -sf /etc/nginx/sites-available/puma-helpdesk /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

### 9. SSL avec Let's Encrypt

> Prérequis : le domaine DNS doit pointer vers votre IP VPS.

```bash
sudo certbot --nginx -d helpdesk.mondomaine.sn --email admin@mondomaine.sn --agree-tos --non-interactive

# Renouvellement automatique
sudo systemctl enable certbot.timer
```

### 10. Pare-feu UFW

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

---

## Mise à jour de l'application

Pour déployer une nouvelle version :

```bash
# 1. Récupérer les nouvelles sources
cd /opt/puma-helpdesk
sudo -u puma git pull   # ou rsync depuis votre machine

# 2. Réinstaller les dépendances (si package.json modifié)
sudo -u puma pnpm install --frozen-lockfile

# 3. Rebuild
sudo -u puma pnpm --filter './lib/**' run build
sudo -u puma pnpm --filter @workspace/api-server run build
sudo -u puma pnpm --filter @workspace/puma-helpdesk run build

# 4. Migrations (si schéma modifié)
sudo -u puma bash -c "cd /opt/puma-helpdesk/lib/db && source /opt/puma-helpdesk/.env && pnpm run push-force"

# 5. Redémarrer l'API
sudo -u puma pm2 restart puma-api

# 6. Recharger Nginx (pour les assets statiques)
sudo nginx -s reload
```

---

## Commandes utiles

```bash
# Logs de l'API en temps réel
sudo -u puma pm2 logs puma-api

# Statut de tous les services
sudo -u puma pm2 status
sudo systemctl status nginx
sudo systemctl status postgresql

# Redémarrer l'API
sudo -u puma pm2 restart puma-api

# Redémarrer Nginx
sudo systemctl restart nginx

# Vérifier les erreurs Nginx
sudo nginx -t
tail -f /var/log/nginx/puma-helpdesk-error.log

# Vérifier la base de données
sudo -u postgres psql puma_helpdesk -c "SELECT count(*) FROM tickets;"

# Backup de la base de données
sudo -u postgres pg_dump puma_helpdesk > backup_$(date +%Y%m%d).sql
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

> ⚠️ **Changez tous les mots de passe avant la mise en production.**  
> Utilisez l'interface Administrateur → Gestion des utilisateurs.

---

## Dépannage

### L'API ne démarre pas

```bash
sudo -u puma pm2 logs puma-api --lines 50
# Vérifier la variable DATABASE_URL dans /opt/puma-helpdesk/.env
```

### Le frontend affiche une page blanche

```bash
# Vérifier le build
ls /opt/puma-helpdesk/artifacts/puma-helpdesk/dist/
# Vérifier nginx
sudo nginx -t
sudo systemctl status nginx
```

### Les notifications SSE ne fonctionnent pas

Vérifier la configuration Nginx :
- `proxy_buffering off;` doit être présent dans le bloc `/api/`
- `proxy_read_timeout` doit être ≥ 3600s
- Pas de CDN ou proxy intermédiaire coupant les connexions longues

### Connexion à la base de données échoue

```bash
# Tester la connexion
psql "postgresql://puma_user:VOTRE_MOT_DE_PASSE@localhost:5432/puma_helpdesk"
# Vérifier PostgreSQL
sudo systemctl status postgresql
```
