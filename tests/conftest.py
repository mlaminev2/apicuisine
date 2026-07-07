import pytest
from fastapi.testclient import TestClient
from sqlmodel import SQLModel, create_engine, Session
from sqlmodel.pool import StaticPool

from app.main import app
from app.db import get_session
from app.models import Household, Member, Settings
from app.auth import hash_password


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

    # Les compteurs de rate-limit sont globaux au process : on repart à zéro
    from app.routers.auth import _login_attempts, _register_attempts
    _login_attempts.clear()
    _register_attempts.clear()

    app.dependency_overrides[get_session] = get_session_override
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()


@pytest.fixture(name="household")
def household_fixture(session):
    hh = Household(name="Test Famille")
    session.add(hh)
    session.commit()
    session.refresh(hh)
    sett = Settings(household_id=hh.id)
    session.add(sett)
    session.commit()

    owner = Member(
        household_id=hh.id,
        name="Test Owner",
        email="owner@test.local",
        password_hash=hash_password("test123456"),
        is_owner=True,
    )
    session.add(owner)
    session.commit()
    session.refresh(owner)
    return hh


@pytest.fixture(name="token")
def token_fixture(client, household):
    res = client.post("/api/login", json={"email": "owner@test.local", "password": "test123456"})
    return res.json()["token"]


@pytest.fixture(name="auth_headers")
def auth_headers_fixture(token):
    return {"Authorization": f"Bearer {token}"}
