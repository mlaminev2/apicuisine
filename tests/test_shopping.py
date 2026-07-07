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


def test_mapped_category_overrides_stale_item_category(client, household, auth_headers):
    """La catégorie assignée via la pastille est ré-appliquée aux articles
    existants à la prochaine sauvegarde de la liste."""
    cats = client.get("/api/shopping-categories", headers=auth_headers).json()
    halal = next(c["id"] for c in cats if "Halal" in c["name"])
    autres = next(c["id"] for c in cats if "Autres" in c["name"])

    # Article inconnu → deviné « Autres »
    r = client.put("/api/shopping/2026/40", json={"items": [{"text": "Dakatine — 1 pot", "checked": False}]}, headers=auth_headers)
    assert r.json()["items"][0]["category_id"] == autres

    # L'utilisateur assigne Halal via la pastille
    client.put("/api/ingredient-map", json={"ingredient_key": "Dakatine", "category_id": halal}, headers=auth_headers)

    # Re-sauvegarde de la même liste (fusion d'ingrédients, coche…) → catégorie corrigée
    items = client.get("/api/shopping/2026/40", headers=auth_headers).json()["items"]
    r = client.put("/api/shopping/2026/40", json={"items": items}, headers=auth_headers)
    assert r.json()["items"][0]["category_id"] == halal


def test_ingredient_key_ignores_emojis(client, household, auth_headers):
    """« Pain 🥖 » et « Pain » partagent la même catégorie assignée."""
    cats = client.get("/api/shopping-categories", headers=auth_headers).json()
    boulangerie = next(c["id"] for c in cats if "Boulangerie" in c["name"])
    client.put("/api/ingredient-map", json={"ingredient_key": "Brioche dorée 🥐", "category_id": boulangerie}, headers=auth_headers)
    r = client.put("/api/shopping/2026/41", json={"items": [{"text": "Brioche dorée — 2", "checked": False}]}, headers=auth_headers)
    assert r.json()["items"][0]["category_id"] == boulangerie
