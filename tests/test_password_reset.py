from app.auth import create_reset_token, create_token
from sqlmodel import select

from app.models import Member


def _get_owner(session):
    return session.exec(select(Member).where(Member.email == "owner@test.local")).one()


def test_forgot_always_ok(client, household):
    # Email inconnu → même réponse (pas d'énumération de comptes)
    res = client.post("/api/password/forgot", json={"email": "inconnu@test.local"})
    assert res.status_code == 200 and res.json() == {"ok": True}
    res = client.post("/api/password/forgot", json={"email": "owner@test.local"})
    assert res.status_code == 200 and res.json() == {"ok": True}


def test_reset_flow(client, household, session):
    owner = _get_owner(session)
    token = create_reset_token(owner)

    res = client.post("/api/password/reset", json={"token": token, "new_password": "nouveaumdp123"})
    assert res.status_code == 200
    assert res.json()["member_name"] == "Test Owner"

    # L'ancien mot de passe ne fonctionne plus, le nouveau oui
    assert client.post("/api/login", json={"email": "owner@test.local", "password": "test123456"}).status_code == 401
    assert client.post("/api/login", json={"email": "owner@test.local", "password": "nouveaumdp123"}).status_code == 200

    # Le jeton est à usage unique
    res = client.post("/api/password/reset", json={"token": token, "new_password": "encoreun12345"})
    assert res.status_code == 401


def test_reset_revokes_existing_sessions(client, household, session, auth_headers):
    # Session active avant la réinitialisation
    assert client.get("/api/members", headers=auth_headers).status_code == 200
    owner = _get_owner(session)
    token = create_reset_token(owner)
    client.post("/api/password/reset", json={"token": token, "new_password": "nouveaumdp123"})
    # L'ancienne session est révoquée
    assert client.get("/api/members", headers=auth_headers).status_code == 401


def test_reset_token_is_not_a_session(client, household, session):
    """Un jeton de réinitialisation ne permet PAS d'appeler l'API."""
    owner = _get_owner(session)
    reset_token = create_reset_token(owner)
    res = client.get("/api/members", headers={"Authorization": f"Bearer {reset_token}"})
    assert res.status_code == 401


def test_session_token_cannot_reset(client, household, session):
    """Un jeton de session ne permet PAS de réinitialiser le mot de passe."""
    owner = _get_owner(session)
    session_token = create_token(owner.id, owner.token_version)
    res = client.post("/api/password/reset", json={"token": session_token, "new_password": "nouveaumdp123"})
    assert res.status_code == 401
