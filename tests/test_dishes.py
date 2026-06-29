from app.models import Dish


def seed_dish(
    session, household_id, name="Tartiflette", category="pomme_de_terre", seed_order=0
):
    d = Dish(
        household_id=household_id, name=name, category=category, seed_order=seed_order
    )
    session.add(d)
    session.commit()
    session.refresh(d)
    return d


def test_list_dishes(client, household, auth_headers, session):
    seed_dish(session, household.id)
    res = client.get("/api/dishes", headers=auth_headers)
    assert res.status_code == 200
    assert len(res.json()) >= 1


def test_list_dishes_by_category(client, household, auth_headers, session):
    seed_dish(session, household.id, "Riz sauté", "riz")
    res = client.get("/api/dishes?category=riz", headers=auth_headers)
    assert res.status_code == 200
    assert all(d["category"] == "riz" for d in res.json())


def test_create_dish(client, household, auth_headers):
    res = client.post(
        "/api/dishes",
        json={"name": "Nouveau plat", "category": "autre"},
        headers=auth_headers,
    )
    assert res.status_code == 201
    assert res.json()["name"] == "Nouveau plat"


def test_update_dish(client, household, auth_headers, session):
    d = seed_dish(session, household.id)
    res = client.put(
        f"/api/dishes/{d.id}", json={"name": "Modifié"}, headers=auth_headers
    )
    assert res.status_code == 200
    assert res.json()["name"] == "Modifié"


def test_soft_delete_dish(client, household, auth_headers, session):
    d = seed_dish(session, household.id)
    res = client.delete(f"/api/dishes/{d.id}", headers=auth_headers)
    assert res.status_code == 200
    session.refresh(d)
    assert d.active is False


def test_dish_not_found(client, household, auth_headers):
    res = client.put("/api/dishes/9999", json={"name": "X"}, headers=auth_headers)
    assert res.status_code == 404
