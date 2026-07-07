import logging
from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
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
        response.headers["Content-Security-Policy"] = (
            "default-src 'none'; "
            "script-src 'self'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: https:; "
            "connect-src 'self'; "
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


@app.get("/api/health")
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

    @app.get("/{full_path:path}")
    def serve_spa(full_path: str):
        candidate = (web_dir / full_path).resolve()
        if (
            candidate.is_relative_to(web_dir_resolved)
            and candidate.exists()
            and candidate.is_file()
        ):
            return FileResponse(str(candidate))
        return FileResponse(str(web_dir / "index.html"))
