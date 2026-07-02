from pathlib import Path

from sqlmodel import SQLModel, create_engine, Session
from app.config import settings

engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False},
)


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
