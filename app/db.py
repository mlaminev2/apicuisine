from pathlib import Path

from sqlalchemy import event
from sqlmodel import SQLModel, create_engine, Session
from app.config import settings

def _engine_kwargs(url: str) -> dict:
    """Options de connexion selon le moteur : SQLite en local, MySQL chez
    l'hebergeur (Hostinger...). pool_pre_ping/pool_recycle evitent les erreurs
    "MySQL server has gone away" quand l'hebergeur coupe les connexions
    inactives."""
    if url.startswith("sqlite"):
        return {"connect_args": {"check_same_thread": False}}
    return {"pool_pre_ping": True, "pool_recycle": 280, "pool_size": 5, "max_overflow": 5}


engine = create_engine(settings.database_url, **_engine_kwargs(settings.database_url))


if settings.database_url.startswith("sqlite"):
    @event.listens_for(engine, "connect")
    def _sqlite_pragmas(dbapi_conn, _record):
        """WAL : lectures et écritures concurrentes sans blocage ; busy_timeout
        évite les erreurs « database is locked » sous charge."""
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA journal_mode=WAL")
        cur.execute("PRAGMA busy_timeout=5000")
        cur.execute("PRAGMA synchronous=NORMAL")
        cur.close()


def _ensure_sqlite_dir() -> None:
    """Crée le dossier de la base SQLite s'il n'existe pas (clone frais, CI)."""
    url = settings.database_url
    if not url.startswith("sqlite:///"):
        return
    db_path = url[len("sqlite:///"):]
    if not db_path or db_path.startswith(":memory:"):
        return
    parent = Path(db_path).parent
    if str(parent) not in ("", "."):
        parent.mkdir(parents=True, exist_ok=True)


def create_db_and_tables() -> None:
    _ensure_sqlite_dir()
    SQLModel.metadata.create_all(engine)


def get_session():
    with Session(engine) as session:
        yield session
