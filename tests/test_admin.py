import pytest
from sqlmodel import Session

from app.models import Member
from app.auth import hash_password


@pytest.fixture(name="member_headers")
def member_headers_fixture(client, household, session: Session):
    m = Member(
        household_id=household.id,
        name="Membre",
        email="membre-admin@test.local",
        password_hash=hash_password("test123456"),
        is_owner=False,
    )
    session.add(m)
    session.commit()
    res = client.post("/api/login", json={"email": "membre-admin@test.local", "password": "test123456"})
    return {"Authorization": f"Bearer {res.json()['token']}"}


def test_admin_stats_owner_only(client, household, auth_headers, member_headers):
    res = client.get("/api/admin/stats", headers=member_headers)
    assert res.status_code == 403
    res = client.get("/api/admin/stats", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["counts"]["members"] == 2
    assert "freemium" in data
    assert any(m["is_owner"] for m in data["members"])
    assert all("imports_this_month" in m for m in data["members"])


def test_admin_backups_owner_only(client, household, auth_headers, member_headers):
    res = client.get("/api/admin/backups", headers=member_headers)
    assert res.status_code == 403
    res = client.get("/api/admin/backups", headers=auth_headers)
    assert res.status_code == 200
    assert "backups" in res.json()


@pytest.fixture(name="super_admin_email")
def super_admin_email_fixture():
    """Restreint l'espace admin à un email précis, puis restaure."""
    from app.config import settings as app_config
    previous = app_config.super_admin_email
    app_config.super_admin_email = "membre-admin@test.local"
    yield
    app_config.super_admin_email = previous


def test_super_admin_email_overrides_owner(client, household, auth_headers, member_headers, super_admin_email):
    # Le propriétaire n'a PAS le bon email → refusé
    res = client.get("/api/admin/stats", headers=auth_headers)
    assert res.status_code == 403
    assert client.get("/api/access", headers=auth_headers).json()["is_admin"] is False

    # Le compte avec l'email configuré (même simple membre) → accès admin
    res = client.get("/api/admin/stats", headers=member_headers)
    assert res.status_code == 200
    assert client.get("/api/access", headers=member_headers).json()["is_admin"] is True
