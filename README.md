# Menus Famille

Planificateur de repas familial — PWA installable, synchronisée entre tous les appareils.

## Démarrage rapide

### Avec Docker (recommandé)

```bash
docker compose up
```

L'application est disponible sur **http://localhost:8000**

Code par défaut : `famille` (modifiable dans `.env`)

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
HOUSEHOLD_PASSCODE=famille       # code partagé du foyer
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

### Render.com (gratuit)

1. Créez un compte sur [render.com](https://render.com)
2. "New Web Service" → connectez votre repo GitHub
3. Build command : `pip install -r requirements.txt && python create_icons.py`
4. Start command : `python -m app.seed && uvicorn app.main:app --host 0.0.0.0 --port $PORT`
5. Ajoutez un **Disk** (volume persistant) monté sur `/data`
6. Variables d'environnement : `HOUSEHOLD_PASSCODE`, `SECRET_KEY`, `DATABASE_URL=sqlite:////data/menu.db`

### Railway / Fly.io

Utilisez le `Dockerfile` fourni. Montez un volume persistant sur `/data`.

## Structure du projet

```
app/          Backend FastAPI + SQLite
web/          Frontend PWA (HTML/CSS/JS vanilla, aucune compilation)
tests/        Tests pytest
data/         Base SQLite (créée au démarrage)
```
