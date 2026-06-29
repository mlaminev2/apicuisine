import pytest
from fastapi.testclient import TestClient
from sqlmodel import SQLModel, create_engine, Session
from sqlmodel.pool import StaticPool

from app.main import app
from app.db import get_session
from app.models import Household, Settings
from app.auth import hash_passcode


@pytest.fixture(name="session")
def session_fixture():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield session


@pytest.fixture(name="client")
def client_fixture(session):
    def get_session_override():
        yield session

    app.dependency_overrides[get_session] = get_session_override
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()


@pytest.fixture(name="household")
def household_fixture(session):
    hh = Household(name="Test Famille", passcode_hash=hash_passcode("test123"))
    session.add(hh)
    session.commit()
    session.refresh(hh)
    sett = Settings(household_id=hh.id)
    session.add(sett)
    session.commit()
    return hh


@pytest.fixture(name="token")
def token_fixture(client, household):
    res = client.post("/api/login", json={"passcode": "test123"})
    return res.json()["token"]


@pytest.fixture(name="auth_headers")
def auth_headers_fixture(token):
    return {"Authorization": f"Bearer {token}"}
