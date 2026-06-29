def test_login_ok(client, household):
    res = client.post("/api/login", json={"passcode": "test123"})
    assert res.status_code == 200
    data = res.json()
    assert "token" in data
    assert data["household_id"] == household.id


def test_login_wrong_passcode(client, household):
    res = client.post("/api/login", json={"passcode": "mauvais"})
    assert res.status_code == 401


def test_health(client):
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


def test_members_requires_auth(client, household):
    res = client.get("/api/members")
    assert res.status_code == 401


def test_create_and_list_members(client, household, auth_headers):
    res = client.post(
        "/api/members", json={"name": "Marie", "color": "#ff0000"}, headers=auth_headers
    )
    assert res.status_code == 201
    assert res.json()["name"] == "Marie"

    res = client.get("/api/members", headers=auth_headers)
    assert res.status_code == 200
    assert any(m["name"] == "Marie" for m in res.json())
