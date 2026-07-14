from sqlmodel import select

from app.models import Dish


def test_defaults_when_not_customized(client, auth_headers):
    r = client.get("/api/meal-categories", headers=auth_headers)
    assert r.status_code == 200
    keys = [c["key"] for c in r.json()]
    assert "riz" in keys and "sauce" in keys and len(keys) == 9


def test_add_category_poisson(client, auth_headers):
    cats = [{"key": "riz", "label": "Riz"}, {"label": "Poisson"}, {"label": "Autre"}]
    r = client.put("/api/meal-categories", json={"categories": cats}, headers=auth_headers)
    assert r.status_code == 200
    keys = [c["key"] for c in r.json()]
    assert "poisson" in keys
    # persiste
    r2 = client.get("/api/meal-categories", headers=auth_headers)
    assert "poisson" in [c["key"] for c in r2.json()]


def test_remove_category_reassigns_dishes(client, session, auth_headers):
    # Un plat en catégorie "sauce"
    d = client.post("/api/dishes", json={"name": "Béchamel", "category": "sauce"}, headers=auth_headers)
    dish_id = d.json()["id"]
    # On retire "sauce" (nouvelle liste sans sauce, avec "autre")
    cats = [{"key": "riz", "label": "Riz"}, {"key": "autre", "label": "Autre"}]
    r = client.put("/api/meal-categories", json={"categories": cats}, headers=auth_headers)
    assert r.status_code == 200
    # Le plat a été déplacé vers "autre"
    dish = session.exec(select(Dish).where(Dish.id == dish_id)).first()
    assert dish.category == "autre"


def test_invalid_category_rejected_after_customization(client, auth_headers):
    # Foyer limité à riz + autre
    client.put("/api/meal-categories", json={"categories": [{"key": "riz", "label": "Riz"}, {"key": "autre", "label": "Autre"}]}, headers=auth_headers)
    # Créer un plat "sauce" (plus dans la liste) -> refusé
    r = client.post("/api/dishes", json={"name": "X", "category": "sauce"}, headers=auth_headers)
    assert r.status_code == 422
    # Créer un plat "poisson" après l'avoir ajouté -> accepté
    client.put("/api/meal-categories", json={"categories": [{"key": "riz", "label": "Riz"}, {"label": "Poisson"}, {"key": "autre", "label": "Autre"}]}, headers=auth_headers)
    r2 = client.post("/api/dishes", json={"name": "Saumon", "category": "poisson"}, headers=auth_headers)
    assert r2.status_code == 201


def test_empty_list_rejected(client, auth_headers):
    r = client.put("/api/meal-categories", json={"categories": []}, headers=auth_headers)
    assert r.status_code == 422
