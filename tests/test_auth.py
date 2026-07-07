def test_login_ok(client, household):
    res = client.post("/api/login", json={"email": "owner@test.local", "password": "test123456"})
    assert res.status_code == 200
    data = res.json()
    assert "token" in data
    assert data["household_id"] == household.id
    assert data["is_owner"] is True
    assert data["member_name"] == "Test Owner"


def test_login_wrong_password(client, household):
    res = client.post("/api/login", json={"email": "owner@test.local", "password": "mauvais"})
    assert res.status_code == 401


def test_login_unknown_email(client, household):
    res = client.post("/api/login", json={"email": "inconnu@test.local", "password": "test123456"})
    assert res.status_code == 401


def test_health(client):
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


def test_members_requires_auth(client, household):
    res = client.get("/api/members")
    assert res.status_code == 401


def test_list_members(client, household, auth_headers):
    res = client.get("/api/members", headers=auth_headers)
    assert res.status_code == 200
    assert any(m["name"] == "Test Owner" for m in res.json())


def test_register_without_invite_creates_empty_household(client, household):
    """Sans code d'invitation, l'inscrit démarre son propre foyer, vide."""
    res = client.post("/api/register", json={
        "name": "Bob", "email": "bob@test.local", "password": "password123"
    })
    assert res.status_code == 201
    data = res.json()
    assert data["household_id"] != household.id
    assert data["is_owner"] is True
    assert data["household_name"] == "Foyer de Bob"
    # Sa base de recettes est vide
    headers = {"Authorization": f"Bearer {data['token']}"}
    dishes = client.get("/api/dishes", headers=headers).json()
    assert dishes == []


def test_households_are_isolated(client, household, auth_headers, session):
    """Un plat créé dans un foyer n'est pas visible depuis un autre."""
    client.post("/api/dishes", json={"name": "Plat du foyer 1", "category": "riz"}, headers=auth_headers)
    res = client.post("/api/register", json={
        "name": "Solo", "email": "solo@test.local", "password": "password123"
    })
    headers = {"Authorization": f"Bearer {res.json()['token']}"}
    assert client.get("/api/dishes", headers=headers).json() == []
    client.post("/api/dishes", json={"name": "Plat du foyer 2", "category": "riz"}, headers=headers)
    names1 = [d["name"] for d in client.get("/api/dishes", headers=auth_headers).json()]
    assert "Plat du foyer 2" not in names1


def test_full_base_email_joins_seed_household(client, household):
    """Les emails FULL_BASE_EMAILS rejoignent le foyer d'origine (base complète)."""
    from app.config import settings as app_config
    previous = app_config.full_base_emails
    app_config.full_base_emails = "famille@test.local"
    try:
        res = client.post("/api/register", json={
            "name": "Famille", "email": "famille@test.local", "password": "password123"
        })
        assert res.status_code == 201
        assert res.json()["household_id"] == household.id  # foyer d'origine, pas un nouveau
        assert res.json()["is_owner"] is False  # un propriétaire existe déjà
    finally:
        app_config.full_base_emails = previous


def test_register_with_invalid_invite(client, household, auth_headers):
    res = client.post("/api/register", json={
        "name": "Bob", "email": "bob@test.local", "password": "password123",
        "invite_code": "mauvais"
    })
    assert res.status_code == 403


def test_register_with_valid_invite(client, household, auth_headers):
    invite_res = client.post("/api/invite", headers=auth_headers)
    assert invite_res.status_code == 200
    code = invite_res.json()["invite_code"]

    res = client.post("/api/register", json={
        "name": "Bob", "email": "bob@test.local", "password": "password123",
        "invite_code": code
    })
    assert res.status_code == 201
    data = res.json()
    assert data["is_owner"] is False
    assert data["member_name"] == "Bob"


def test_register_duplicate_email(client, household, auth_headers):
    invite_res = client.post("/api/invite", headers=auth_headers)
    code = invite_res.json()["invite_code"]
    client.post("/api/register", json={
        "name": "Bob", "email": "bob@test.local", "password": "password123",
        "invite_code": code
    })
    res = client.post("/api/register", json={
        "name": "Bob2", "email": "bob@test.local", "password": "password123",
        "invite_code": code
    })
    assert res.status_code == 409


def test_non_owner_cannot_create_invite(client, household, auth_headers):
    invite_res = client.post("/api/invite", headers=auth_headers)
    code = invite_res.json()["invite_code"]
    bob_res = client.post("/api/register", json={
        "name": "Bob", "email": "bob@test.local", "password": "password123",
        "invite_code": code
    })
    bob_token = bob_res.json()["token"]
    res = client.post("/api/invite", headers={"Authorization": f"Bearer {bob_token}"})
    assert res.status_code == 403


def test_owner_can_delete_member(client, household, auth_headers):
    invite_res = client.post("/api/invite", headers=auth_headers)
    code = invite_res.json()["invite_code"]
    bob_res = client.post("/api/register", json={
        "name": "Bob", "email": "bob@test.local", "password": "password123",
        "invite_code": code
    })
    bob_id = bob_res.json()["member_id"]
    res = client.delete(f"/api/members/{bob_id}", headers=auth_headers)
    assert res.status_code == 204


def test_owner_cannot_delete_owner(client, household, auth_headers):
    members_res = client.get("/api/members", headers=auth_headers)
    owner_id = next(m["id"] for m in members_res.json() if m["is_owner"])
    res = client.delete(f"/api/members/{owner_id}", headers=auth_headers)
    assert res.status_code == 400


def test_non_owner_cannot_delete_member(client, household, auth_headers):
    invite_res = client.post("/api/invite", headers=auth_headers)
    code = invite_res.json()["invite_code"]
    bob_res = client.post("/api/register", json={
        "name": "Bob", "email": "bob@test.local", "password": "password123",
        "invite_code": code
    })
    bob_token = bob_res.json()["token"]
    members_res = client.get("/api/members", headers=auth_headers)
    owner_id = next(m["id"] for m in members_res.json() if m["is_owner"])
    res = client.delete(f"/api/members/{owner_id}", headers={"Authorization": f"Bearer {bob_token}"})
    assert res.status_code == 403


def test_revoke_invite_blocks_registration(client, household, auth_headers):
    client.post("/api/invite", headers=auth_headers)
    client.delete("/api/invite", headers=auth_headers)
    res = client.post("/api/register", json={
        "name": "Carl", "email": "carl@test.local", "password": "password123",
        "invite_code": "quelconque"
    })
    assert res.status_code == 403
