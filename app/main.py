import logging
from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, RedirectResponse
from pathlib import Path
from sqlalchemy import text
from app.db import create_db_and_tables, engine

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)s — %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
logger = logging.getLogger(__name__)
from app.seed import run_seed
from app.routers import (
    admin,
    auth,
    members,
    dishes,
    priority,
    plan,
    shopping,
    tracking,
    settings,
    import_url,
    categories,
    oauth,
    billing,
    push,
)

app = FastAPI(title="Menus Famille", version="1.0.0")


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    if request.url.scheme == "https":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    if "text/html" in response.headers.get("content-type", ""):
        from app.config import settings as _cfg
        # Domaines autorisés pour Google Analytics et le Pixel Meta (chargés
        # uniquement après consentement RGPD, mais autorisés ici par la CSP).
        script = "https://www.googletagmanager.com https://connect.facebook.net"
        conn = ("https://www.google-analytics.com https://*.google-analytics.com "
                "https://*.analytics.google.com https://www.googletagmanager.com "
                "https://connect.facebook.net https://www.facebook.com")
        frame = ""
        # AdSense : nombreux domaines (scripts, iframes de pub) — ajoutés
        # uniquement quand la pub est activée, pour garder la CSP stricte sinon.
        if _cfg.adsense_client_id:
            ads = ("https://pagead2.googlesyndication.com https://*.googlesyndication.com "
                   "https://partner.googleadservices.com https://tpc.googlesyndication.com "
                   "https://www.googletagservices.com https://adservice.google.com "
                   "https://*.adtrafficquality.google https://fundingchoicesmessages.google.com")
            script += " " + ads
            conn += " " + ads + " https://*.g.doubleclick.net https://*.google.com"
            frame = ("frame-src https://*.googlesyndication.com https://*.g.doubleclick.net "
                     "https://www.google.com https://*.adtrafficquality.google "
                     "https://fundingchoicesmessages.google.com; ")
        response.headers["Content-Security-Policy"] = (
            "default-src 'none'; "
            f"script-src 'self' {script}; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: https:; "
            f"connect-src 'self' {conn}; "
            f"{frame}"
            "manifest-src 'self'; "
            "worker-src 'self'; "
            "font-src 'self'; "
            "object-src 'none'; "
            "base-uri 'self'; "
            "form-action 'self'; "
            "frame-ancestors 'none'"
        )
    return response


app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(members.router)
app.include_router(dishes.router)
app.include_router(priority.router)
app.include_router(plan.router)
app.include_router(shopping.router)
app.include_router(tracking.router)
app.include_router(settings.router)
app.include_router(import_url.router)
app.include_router(categories.router)
app.include_router(oauth.router)
app.include_router(billing.router)
app.include_router(push.router)


@app.api_route("/api/health", methods=["GET", "HEAD"])
def health():
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"status": "ok", "db": "ok"}
    except Exception:
        from fastapi.responses import JSONResponse
        logger.error("Health check: DB inaccessible")
        return JSONResponse(status_code=503, content={"status": "degraded", "db": "error"})


def _migrate():
    """Add new columns to existing tables without dropping data."""
    with engine.connect() as conn:
        for col, definition in [
            ("ingredients", "TEXT NOT NULL DEFAULT '[]'"),
            ("instructions", "TEXT NOT NULL DEFAULT '[]'"),
            ("source_url", "TEXT"),
            ("thumbnail_url", "TEXT"),
            ("author", "TEXT"),
            ("is_favorite", "BOOLEAN NOT NULL DEFAULT 0"),
            ("diet_tags", "TEXT"),
        ]:
            try:
                conn.execute(text(f"ALTER TABLE dish ADD COLUMN {col} {definition}"))
                conn.commit()
            except Exception:
                pass  # column already exists
        try:
            conn.execute(text("ALTER TABLE plan_entry ADD COLUMN entree_dish_id INTEGER REFERENCES dish(id)"))
            conn.commit()
        except Exception:
            pass
        for col, definition in [
            ("lunch_dish_id", "INTEGER REFERENCES dish(id)"),
            ("lunch_free_text", "TEXT"),
            ("extra_dishes", "TEXT NOT NULL DEFAULT '[]'"),
            ("apero_dish_id", "INTEGER REFERENCES dish(id)"),
            ("sauce_dish_id", "INTEGER REFERENCES dish(id)"),
        ]:
            try:
                conn.execute(text(f"ALTER TABLE plan_entry ADD COLUMN {col} {definition}"))
                conn.commit()
            except Exception:
                pass
        for col, definition in [
            ("lunch_enabled", "BOOLEAN NOT NULL DEFAULT 0"),
            ("multi_dish_enabled", "BOOLEAN NOT NULL DEFAULT 0"),
            ("freemium_enabled", "BOOLEAN NOT NULL DEFAULT 0"),
            ("dietary_notes", "TEXT"),
            ("meal_categories", "TEXT"),
        ]:
            try:
                conn.execute(text(f"ALTER TABLE settings ADD COLUMN {col} {definition}"))
                conn.commit()
            except Exception:
                pass
        for col, definition in [
            ("email", "TEXT"),
            ("password_hash", "TEXT"),
            ("is_owner", "BOOLEAN NOT NULL DEFAULT 0"),
        ]:
            try:
                conn.execute(text(f"ALTER TABLE member ADD COLUMN {col} {definition}"))
                conn.commit()
            except Exception:
                pass
        for col, definition in [
            ("invite_code", "TEXT"),
            ("invite_code_created_at", "TIMESTAMP"),
        ]:
            try:
                conn.execute(text(f"ALTER TABLE household ADD COLUMN {col} {definition}"))
                conn.commit()
            except Exception:
                pass
        try:
            conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_member_email ON member(email)"))
            conn.commit()
        except Exception:
            pass
        for col, definition in [
            ("oauth_provider", "TEXT"),
            ("oauth_sub", "TEXT"),
            ("token_version", "INTEGER NOT NULL DEFAULT 0"),
            ("is_premium", "BOOLEAN NOT NULL DEFAULT 0"),
            ("import_count", "INTEGER NOT NULL DEFAULT 0"),
            ("import_month", "TEXT"),
            ("premium_source", "TEXT"),
            ("stripe_customer_id", "TEXT"),
            ("stripe_subscription_id", "TEXT"),
            ("reminder_enabled", "BOOLEAN NOT NULL DEFAULT 0"),
        ]:
            try:
                conn.execute(text(f"ALTER TABLE member ADD COLUMN {col} {definition}"))
                conn.commit()
            except Exception:
                pass


@app.on_event("startup")
def on_startup():
    create_db_and_tables()
    _migrate()
    run_seed()
    from app.config import settings as _s
    if _s.secret_key == "dev-secret-key-change-in-production":
        if _s.app_env == "dev":
            logger.warning("SECRET_KEY est la clé de développement — changez-la en production !")
        else:
            raise RuntimeError(
                "SECRET_KEY est la clé de développement publique : refus de démarrer "
                "en production. Définissez SECRET_KEY dans l'environnement."
            )
    logger.info("Menus Famille démarré")


web_dir = Path(__file__).parent.parent / "web"
if web_dir.exists():
    web_dir_resolved = web_dir.resolve()
    app.mount("/static", StaticFiles(directory=str(web_dir)), name="static")

    @app.get("/")
    def serve_root():
        return FileResponse(str(web_dir / "index.html"))

    def _canonical_html_redirect(full_path: str, candidate: Path) -> str | None:
        """URL canonique pour un fichier .html demandé explicitement, sinon None.

        Évite le contenu dupliqué signalé par la Search Console : `.html` et
        `index.html` renvoient une seule URL propre (301) au lieu d'un 200.
        """
        if candidate.suffix != ".html":
            return None
        if full_path.endswith("/index.html"):
            return "/" + full_path[: -len("index.html")]  # garde le slash du dossier
        if full_path == "index.html":
            return "/"
        return "/" + full_path[: -len(".html")]

    @app.get("/{full_path:path}")
    def serve_spa(full_path: str):
        candidate = (web_dir / full_path).resolve()
        if candidate.is_relative_to(web_dir_resolved):
            # Fichier existant (assets, pages statiques)
            if candidate.is_file():
                # Normalisation SEO : une seule URL canonique par page HTML.
                target = _canonical_html_redirect(full_path, candidate)
                if target is not None and target != "/" + full_path:
                    return RedirectResponse(target, status_code=301)
                return FileResponse(str(candidate))
            # Dossier avec index.html (ex: /conseils/ -> conseils/index.html)
            index = candidate / "index.html"
            if candidate.is_dir() and index.is_file():
                # Un dossier doit avoir un slash final (URL canonique).
                if full_path and not full_path.endswith("/"):
                    return RedirectResponse("/" + full_path + "/", status_code=301)
                return FileResponse(str(index))
            # URL propre sans extension (ex: /conseils/batch-cooking -> .html)
            html = candidate.with_suffix(".html")
            if html.is_relative_to(web_dir_resolved) and html.is_file():
                # Une page-fichier ne doit pas avoir de slash final (URL canonique).
                if full_path.endswith("/"):
                    return RedirectResponse("/" + full_path.rstrip("/"), status_code=301)
                return FileResponse(str(html))
        # Sinon : on sert la SPA (routage géré côté client par le hash)
        return FileResponse(str(web_dir / "index.html"))
