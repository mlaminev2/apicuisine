# Déployer Menus Famille chez Hostinger

L'application est un backend **Python (FastAPI)**. Chez Hostinger, cela demande un
**VPS** (l'hébergement web mutualisé Hostinger n'exécute que PHP/Node.js et ne peut
pas faire tourner FastAPI). La base de données peut être **MySQL** (celle de
Hostinger) ou SQLite sur le disque du VPS.

## Ce qu'il faut

- Un **VPS Hostinger** (KVM 1 suffit largement) — idéalement créé avec le
  template **« Ubuntu 24.04 with Docker »** (sinon, installez Docker vous-même)
- Un nom de domaine (optionnel mais recommandé, pour le HTTPS)

## 1. Créer la base MySQL (optionnel — sinon SQLite)

Deux possibilités :

**A. MySQL sur le VPS (recommandé, tout au même endroit)**

```bash
docker run -d --name menus-mysql --restart unless-stopped \
  -e MYSQL_ROOT_PASSWORD='UN_MDP_ROOT_FORT' \
  -e MYSQL_DATABASE=menus \
  -e MYSQL_USER=menus \
  -e MYSQL_PASSWORD='UN_MDP_FORT' \
  -v menus_mysql:/var/lib/mysql \
  --network menus-net \
  mysql:8
```

`DATABASE_URL` sera alors :
`mysql+pymysql://menus:UN_MDP_FORT@menus-mysql:3306/menus?charset=utf8mb4`

**B. MySQL d'un hébergement mutualisé Hostinger que vous possédez déjà**

1. hPanel → **Bases de données → Gestion** : créez la base et l'utilisateur
   (notez le nom complet, ex. `u123456789_menus`)
2. hPanel → **Bases de données → MySQL distant (Remote MySQL)** : autorisez
   l'**IP de votre VPS** (ou « tout hôte » le temps des tests)
3. L'hôte MySQL est affiché dans hPanel (ex. `srv1234.hstgr.io`)

`DATABASE_URL` sera alors :
`mysql+pymysql://u123456789_menus:MOT_DE_PASSE@srv1234.hstgr.io:3306/u123456789_menus?charset=utf8mb4`

**C. Pas de MySQL du tout** : gardez SQLite (défaut du docker-compose), les
données vivent dans le volume Docker `menu_data`. Parfait pour un usage familial.

## 2. Déployer l'application sur le VPS

Connectez-vous en SSH (hPanel → VPS → SSH), puis :

```bash
# réseau partagé app <-> mysql (si option A)
docker network create menus-net || true

git clone https://github.com/mlaminev2/apicuisine.git
cd apicuisine

# Configuration
cp .env.example .env
nano .env
#   APP_ENV=production
#   SECRET_KEY=<une longue chaîne aléatoire :  openssl rand -hex 32>
#   DATABASE_URL=<votre URL MySQL, ou laissez la valeur sqlite du compose>

docker compose up -d --build
```

> Avec MySQL option A, ajoutez le service au même réseau :
> `docker compose up -d --build` puis
> `docker network connect menus-net apicuisine-app-1`
> (ou déclarez `network_mode` dans un override — voir docker-compose.yml).

L'application écoute sur le port **8000**. Vérifiez : `curl http://localhost:8000/api/health`

Les tables sont créées et les 86 plats chargés automatiquement au premier
démarrage (`create_all` + seed idempotent). Les migrations de colonnes sont
également automatiques à chaque mise à jour.

## 3. HTTPS avec votre domaine (recommandé)

Pointez un sous-domaine (ex. `menus.votredomaine.fr`) vers l'IP du VPS
(enregistrement DNS **A**), puis installez Caddy — HTTPS automatique :

```bash
docker run -d --name caddy --restart unless-stopped \
  -p 80:80 -p 443:443 \
  -v caddy_data:/data \
  --network host \
  caddy caddy reverse-proxy --from menus.votredomaine.fr --to localhost:8000
```

Ouvrez ensuite `https://menus.votredomaine.fr` — la PWA est installable depuis
le navigateur du téléphone (« Ajouter à l'écran d'accueil »).

> Le HTTPS est nécessaire pour le service worker (hors-ligne) et pour OAuth
> Google en dehors de localhost.

## 4. Mises à jour

```bash
cd apicuisine
git pull
docker compose up -d --build
```

## 5. Sauvegardes

- **SQLite** : sauvegardez le volume — `docker run --rm -v menu_data:/data -v $PWD:/backup alpine cp /data/menu.db /backup/`
- **MySQL** : `docker exec menus-mysql mysqldump -u menus -p menus > backup.sql`
  (ou l'outil d'export de hPanel pour l'option B)
- Dans l'app : ⚙️ Réglages → Export JSON complet du foyer

## Variables d'environnement

| Variable | Rôle | Exemple |
|---|---|---|
| `APP_ENV` | `production` active les contrôles stricts | `production` |
| `SECRET_KEY` | Signe les jetons de connexion — **obligatoire** en production | `openssl rand -hex 32` |
| `DATABASE_URL` | SQLite ou MySQL | voir `.env.example` |
| `PORT` | Port d'écoute | `8000` |
| `IMPORT_FREE_LIMIT` | Imports gratuits/mois (freemium) | `3` |
| `GOOGLE_CLIENT_ID/SECRET` | Connexion Google (optionnel) | — |
