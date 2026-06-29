def test_get_empty_shopping(client, household, auth_headers):
    res = client.get("/api/shopping/2026/27", headers=auth_headers)
    assert res.status_code == 200
    assert res.json()["items"] == []


def test_put_shopping(client, household, auth_headers):
    items = [{"text": "Carottes", "checked": False}, {"text": "Lait", "checked": True}]
    res = client.put(
        "/api/shopping/2026/27", json={"items": items}, headers=auth_headers
    )
    assert res.status_code == 200
    assert len(res.json()["items"]) == 2


def test_shopping_persistence(client, household, auth_headers):
    items = [{"text": "Pain", "checked": False}]
    client.put("/api/shopping/2026/28", json={"items": items}, headers=auth_headers)
    res = client.get("/api/shopping/2026/28", headers=auth_headers)
    assert res.json()["items"][0]["text"] == "Pain"


def test_shopping_uniqueness(client, household, auth_headers):
    items1 = [{"text": "Tomates", "checked": False}]
    items2 = [
        {"text": "Tomates", "checked": False},
        {"text": "Oignons", "checked": False},
    ]
    client.put("/api/shopping/2026/29", json={"items": items1}, headers=auth_headers)
    client.put("/api/shopping/2026/29", json={"items": items2}, headers=auth_headers)
    res = client.get("/api/shopping/2026/29", headers=auth_headers)
    assert len(res.json()["items"]) == 2
