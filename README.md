# Menus Famille

Planificateur de repas familial — PWA installable, synchronisée entre tous les appareils.

## Démarrage rapide

### Avec Docker (recommandé)

```bash
docker compose up
```

L'application est disponible sur **http://localhost:8000**

Créez votre compte sur `http://localhost:8000/#/inscription`. Sans code d'invitation, chaque inscription crée un nouveau foyer vide dont vous êtes propriétaire ; avec un code, vous rejoignez le foyer de celui qui vous invite. Les emails listés dans `FULL_BASE_EMAILS` rejoignent le foyer d'origine (base de recettes pré-remplie).

### Sans Docker

```bash
pip install -r requirements.txt
python create_icons.py          # génère les icônes PWA
python -m app.seed              # charge les 86 plats (idempotent)
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

## Accès depuis le téléphone (même WiFi)

1. Trouvez l'IP de votre PC : `ipconfig` (Windows) → adresse IPv4
2. Sur le téléphone, ouvrez `http://<IP-PC>:8000`
3. Ajoutez à l'écran d'accueil via le menu du navigateur

## Configuration (.env)

```
DATABASE_URL=sqlite:///./data/menu.db
PORT=8000
SECRET_KEY=changez-en-production
```

## Tests & qualité

```bash
pytest                           # tous les tests
ruff check . && ruff format .   # lint + formatage
```

## Déploiement en ligne (synchro hors-maison)

### Hostinger (VPS + MySQL)

Guide complet pas à pas : **[DEPLOY-HOSTINGER.md](DEPLOY-HOSTINGER.md)**
(VPS Docker, base MySQL Hostinger ou SQLite, HTTPS avec votre domaine).

La base de données se choisit via `DATABASE_URL` :
- SQLite (défaut) : `sqlite:////data/menu.db`
- MySQL Hostinger : `mysql+pymysql://user:motdepasse@hote:3306/base?charset=utf8mb4`

### Autres hébergeurs (Railway / Fly.io / Render…)

Utilisez le `Dockerfile` fourni. Montez un volume persistant sur `/data`
(ou pointez `DATABASE_URL` vers un MySQL).

## Structure du projet

```
app/          Backend FastAPI + SQLite
web/          Frontend PWA (HTML/CSS/JS vanilla, aucune compilation)
tests/        Tests pytest
data/         Base SQLite (créée au démarrage)
```
