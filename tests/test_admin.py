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


def test_admin_stats_platform_wide(client, household, auth_headers, member_headers):
    # Refusé aux non-admins
    assert client.get("/api/admin/stats", headers=member_headers).status_code == 403

    # Un second foyer existe sur la plateforme
    client.post("/api/register", json={"name": "Zoe", "email": "zoe@test.local", "password": "password123"})

    res = client.get("/api/admin/stats", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["platform"]["households"] == 2
    assert data["platform"]["members"] == 3
    assert len(data["households"]) == 2
    assert any(h["is_admin_household"] for h in data["households"])
    assert len(data["members"]) == 3
    assert any(m["is_self"] for m in data["members"])


def test_admin_premium_cross_household(client, household, auth_headers):
    r = client.post("/api/register", json={"name": "Zoe", "email": "zoe2@test.local", "password": "password123"})
    zid = r.json()["member_id"]
    # L'admin accorde le premium à un utilisateur d'un AUTRE foyer
    res = client.put(f"/api/admin/members/{zid}/premium", json={"is_premium": True}, headers=auth_headers)
    assert res.status_code == 200
    assert res.json()["is_premium"] is True


def test_admin_platform_freemium(client, household, auth_headers):
    client.post("/api/register", json={"name": "Zoe", "email": "zoe3@test.local", "password": "password123"})
    res = client.put("/api/admin/freemium", json={"enabled": True}, headers=auth_headers)
    assert res.status_code == 200
    assert res.json()["households_updated"] == 2
    # Tous les foyers passent en freemium
    stats = client.get("/api/admin/stats", headers=auth_headers).json()
    assert all(h["freemium_enabled"] for h in stats["households"])


def test_admin_delete_household(client, household, auth_headers):
    r = client.post("/api/register", json={"name": "Zoe", "email": "zoe4@test.local", "password": "password123"})
    hid = r.json()["household_id"]
    zheaders = {"Authorization": f"Bearer {r.json()['token']}"}
    client.post("/api/dishes", json={"name": "Plat de Zoe", "category": "riz"}, headers=zheaders)

    res = client.delete(f"/api/admin/households/{hid}", headers=auth_headers)
    assert res.status_code == 204
    stats = client.get("/api/admin/stats", headers=auth_headers).json()
    assert all(h["id"] != hid for h in stats["households"])
    # Impossible de supprimer son propre foyer
    res = client.delete(f"/api/admin/households/{household.id}", headers=auth_headers)
    assert res.status_code == 400


def test_admin_delete_member_not_self(client, household, auth_headers, member_headers):
    stats = client.get("/api/admin/stats", headers=auth_headers).json()
    me = next(m for m in stats["members"] if m["is_self"])
    other = next(m for m in stats["members"] if not m["is_self"])
    assert client.delete(f"/api/admin/members/{me['id']}", headers=auth_headers).status_code == 400
    assert client.delete(f"/api/admin/members/{other['id']}", headers=auth_headers).status_code == 204


def test_household_owner_cannot_manage_freemium_when_super_admin_set(client, household, auth_headers):
    """En production (SUPER_ADMIN_EMAIL défini), un propriétaire de foyer lambda
    ne peut ni gérer le freemium ni accorder le premium."""
    from app.config import settings as app_config
    previous = app_config.super_admin_email
    app_config.super_admin_email = "quelquun.dautre@test.local"
    try:
        res = client.put("/api/settings", json={"freemium_enabled": True}, headers=auth_headers)
        assert res.status_code == 403
        res = client.get("/api/admin/stats", headers=auth_headers)
        assert res.status_code == 403
    finally:
        app_config.super_admin_email = previous


def test_admin_backups(client, household, auth_headers, member_headers):
    assert client.get("/api/admin/backups", headers=member_headers).status_code == 403
    res = client.get("/api/admin/backups", headers=auth_headers)
    assert res.status_code == 200
    assert "backups" in res.json()
