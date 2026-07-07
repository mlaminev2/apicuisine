from datetime import datetime, timezone

import pytest
from sqlmodel import Session, select

from app.models import Member
from app.auth import hash_password
from app.config import settings as app_config


@pytest.fixture(name="member_headers")
def member_headers_fixture(client, household, session: Session):
    """Un membre non-propriétaire, non-premium."""
    m = Member(
        household_id=household.id,
        name="Membre",
        email="membre@test.local",
        password_hash=hash_password("test123456"),
        is_owner=False,
    )
    session.add(m)
    session.commit()
    res = client.post("/api/login", json={"email": "membre@test.local", "password": "test123456"})
    return {"Authorization": f"Bearer {res.json()['token']}"}


def _member_id(client, auth_headers):
    members = client.get("/api/members", headers=auth_headers).json()
    return next(m["id"] for m in members if not m["is_owner"])


def _exhaust_quota(session: Session):
    """Simule un quota mensuel épuisé pour le membre simple."""
    m = session.exec(select(Member).where(Member.email == "membre@test.local")).one()
    m.import_month = datetime.now(timezone.utc).strftime("%Y-%m")
    m.import_count = app_config.import_free_limit
    session.add(m)
    session.commit()


def test_freemium_off_everyone_unlimited(client, household, auth_headers, member_headers):
    res = client.get("/api/access", headers=member_headers)
    data = res.json()
    assert data["premium_active"] is True
    assert data["imports_remaining"] is None  # illimité
    res = client.post("/api/extract-text", json={"text": "Recette test"}, headers=member_headers)
    assert res.status_code == 200


def test_freemium_on_quota_then_block(client, household, auth_headers, member_headers, session):
    client.put("/api/settings", json={"freemium_enabled": True}, headers=auth_headers)

    # Quota affiché, import encore possible
    data = client.get("/api/access", headers=member_headers).json()
    assert data["premium_active"] is False
    assert data["import_limit"] == app_config.import_free_limit
    assert data["imports_remaining"] == app_config.import_free_limit
    res = client.post("/api/extract-text", json={"text": "Recette test"}, headers=member_headers)
    assert res.status_code == 200

    # import-save consomme le quota
    res = client.post(
        "/api/import-save",
        json={"name": "Plat importé", "category": "riz", "url": "https://exemple.com/recette",
              "ingredients": [], "instructions": [], "iso_year": 2026, "iso_week": 28},
        headers=member_headers,
    )
    assert res.status_code == 200
    assert client.get("/api/access", headers=member_headers).json()["imports_remaining"] == app_config.import_free_limit - 1

    # Quota épuisé → 403 avec un message qui mentionne la limite
    _exhaust_quota(session)
    res = client.post("/api/extract-text", json={"text": "Recette test"}, headers=member_headers)
    assert res.status_code == 403
    assert "limite" in res.json()["detail"].lower()

    # Le propriétaire reste illimité
    res = client.post("/api/extract-text", json={"text": "Recette test"}, headers=auth_headers)
    assert res.status_code == 200
    assert client.get("/api/access", headers=auth_headers).json()["imports_remaining"] is None


def test_owner_grants_premium_bypasses_quota(client, household, auth_headers, member_headers, session):
    client.put("/api/settings", json={"freemium_enabled": True}, headers=auth_headers)
    _exhaust_quota(session)
    res = client.post("/api/extract-text", json={"text": "Recette test"}, headers=member_headers)
    assert res.status_code == 403

    # Autorisation spéciale : le compte retrouve tout, sans payer
    mid = _member_id(client, auth_headers)
    res = client.put(f"/api/members/{mid}/premium", json={"is_premium": True}, headers=auth_headers)
    assert res.status_code == 200
    data = client.get("/api/access", headers=member_headers).json()
    assert data["premium_active"] is True
    assert data["imports_remaining"] is None
    res = client.post("/api/extract-text", json={"text": "Recette test"}, headers=member_headers)
    assert res.status_code == 200

    # Retrait du premium → le quota (épuisé) s'applique de nouveau
    client.put(f"/api/members/{mid}/premium", json={"is_premium": False}, headers=auth_headers)
    res = client.post("/api/extract-text", json={"text": "Recette test"}, headers=member_headers)
    assert res.status_code == 403


def test_premium_grant_works_even_freemium_off(client, household, auth_headers, member_headers):
    # Autorisation accordable à tout moment, même freemium désactivé
    mid = _member_id(client, auth_headers)
    res = client.put(f"/api/members/{mid}/premium", json={"is_premium": True}, headers=auth_headers)
    assert res.status_code == 200
    assert res.json()["is_premium"] is True
    # Si le freemium est activé ensuite, le compte garde tous les accès
    client.put("/api/settings", json={"freemium_enabled": True}, headers=auth_headers)
    assert client.get("/api/access", headers=member_headers).json()["premium_active"] is True


def test_non_owner_cannot_manage_freemium(client, household, auth_headers, member_headers):
    res = client.put("/api/settings", json={"freemium_enabled": True}, headers=member_headers)
    assert res.status_code == 403
    mid = _member_id(client, auth_headers)
    res = client.put(f"/api/members/{mid}/premium", json={"is_premium": True}, headers=member_headers)
    assert res.status_code == 403


def test_premium_toggle_rejected_on_owner(client, household, auth_headers):
    members = client.get("/api/members", headers=auth_headers).json()
    owner_id = next(m["id"] for m in members if m["is_owner"])
    res = client.put(f"/api/members/{owner_id}/premium", json={"is_premium": True}, headers=auth_headers)
    assert res.status_code == 400
