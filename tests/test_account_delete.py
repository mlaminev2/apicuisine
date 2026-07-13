from sqlmodel import Session, select

from app.auth import hash_password
from app.models import Dish, Household, Member


def _auth(tok):
    return {"Authorization": f"Bearer {tok}"}


def _login(client, email, pwd="test123456"):
    return client.post("/api/login", json={"email": email, "password": pwd}).json()["token"]


def _add_member(session: Session, hh_id: int, name: str, email: str, owner=False):
    m = Member(household_id=hh_id, name=name, email=email,
               password_hash=hash_password("test123456"), is_owner=owner)
    session.add(m)
    session.commit()
    session.refresh(m)
    return m


def _not_admin(monkeypatch):
    from app.config import settings as cfg
    monkeypatch.setattr(cfg, "super_admin_email", "admin@platform.test")


def test_regular_member_deletes_own_account(client, session, household, monkeypatch):
    _not_admin(monkeypatch)
    m2 = _add_member(session, household.id, "Enfant", "enfant@test.local")
    tok = _login(client, "enfant@test.local")
    r = client.post("/api/me/delete", json={"password": "test123456"}, headers=_auth(tok))
    assert r.status_code == 204
    assert session.exec(select(Member).where(Member.id == m2.id)).first() is None
    # Le foyer et le propriétaire restent
    assert session.get(Household, household.id) is not None


def test_wrong_password_blocks_deletion(client, session, household, monkeypatch):
    _not_admin(monkeypatch)
    m2 = _add_member(session, household.id, "Ado", "ado@test.local")
    tok = _login(client, "ado@test.local")
    r = client.post("/api/me/delete", json={"password": "MAUVAIS"}, headers=_auth(tok))
    assert r.status_code == 400
    assert session.exec(select(Member).where(Member.id == m2.id)).first() is not None


def test_owner_deletion_transfers_ownership(client, session, household, auth_headers, monkeypatch):
    _not_admin(monkeypatch)
    m2 = _add_member(session, household.id, "Conjoint", "conjoint@test.local")
    r = client.post("/api/me/delete", json={"password": "test123456"}, headers=auth_headers)
    assert r.status_code == 204
    assert session.exec(select(Member).where(Member.email == "owner@test.local")).first() is None
    heir = session.exec(select(Member).where(Member.id == m2.id)).first()
    assert heir is not None and heir.is_owner is True
    assert session.get(Household, household.id) is not None


def test_sole_owner_deletion_removes_household(client, session, household, auth_headers, monkeypatch):
    _not_admin(monkeypatch)
    client.post("/api/dishes", json={"name": "Plat X", "category": "riz"}, headers=auth_headers)
    r = client.post("/api/me/delete", json={"password": "test123456"}, headers=auth_headers)
    assert r.status_code == 204
    assert session.get(Household, household.id) is None
    assert session.exec(select(Dish).where(Dish.household_id == household.id)).all() == []


def test_super_admin_cannot_self_delete(client, household, auth_headers, monkeypatch):
    from app.config import settings as cfg
    monkeypatch.setattr(cfg, "super_admin_email", "owner@test.local")
    r = client.post("/api/me/delete", json={"password": "test123456"}, headers=auth_headers)
    assert r.status_code == 403
