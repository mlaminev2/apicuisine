from app.models import Dish


def make_dish(session, hh_id, name="Plat test", category="riz"):
    d = Dish(household_id=hh_id, name=name, category=category)
    session.add(d)
    session.commit()
    session.refresh(d)
    return d


def test_put_and_get_plan(client, household, auth_headers, session):
    d = make_dish(session, household.id)
    res = client.put(
        "/api/plan/2026-07-15", json={"main_dish_id": d.id}, headers=auth_headers
    )
    assert res.status_code == 200
    assert res.json()["main_dish_id"] == d.id

    res = client.get("/api/plan?from=2026-07-01&to=2026-07-31", headers=auth_headers)
    assert any(e["date"] == "2026-07-15" for e in res.json())


def test_patch_cooked(client, household, auth_headers, session):
    d = make_dish(session, household.id)
    client.put(
        "/api/plan/2026-07-16", json={"main_dish_id": d.id}, headers=auth_headers
    )
    res = client.patch(
        "/api/plan/2026-07-16", json={"cooked": True}, headers=auth_headers
    )
    assert res.status_code == 200
    assert res.json()["cooked"] is True
    assert res.json()["cooked_at"] is not None


def test_delete_plan(client, household, auth_headers, session):
    d = make_dish(session, household.id)
    client.put(
        "/api/plan/2026-07-17", json={"main_dish_id": d.id}, headers=auth_headers
    )
    res = client.delete("/api/plan/2026-07-17", headers=auth_headers)
    assert res.status_code == 200
    res = client.get("/api/plan?from=2026-07-17&to=2026-07-17", headers=auth_headers)
    assert len(res.json()) == 0


def test_plan_uniqueness(client, household, auth_headers, session):
    d = make_dish(session, household.id)
    client.put(
        "/api/plan/2026-07-18", json={"main_dish_id": d.id}, headers=auth_headers
    )
    d2 = make_dish(session, household.id, "Plat 2")
    res = client.put(
        "/api/plan/2026-07-18", json={"main_dish_id": d2.id}, headers=auth_headers
    )
    assert res.status_code == 200
    res = client.get("/api/plan?from=2026-07-18&to=2026-07-18", headers=auth_headers)
    assert len(res.json()) == 1


def test_plan_free_text(client, household, auth_headers):
    res = client.put(
        "/api/plan/2026-07-19", json={"free_text": "Plat spécial"}, headers=auth_headers
    )
    assert res.status_code == 200
    assert res.json()["free_text"] == "Plat spécial"


def test_plan_lunch(client, household, auth_headers, session):
    d = make_dish(session, household.id, "Plat midi")
    res = client.put(
        "/api/plan/2026-07-20", json={"lunch_dish_id": d.id}, headers=auth_headers
    )
    assert res.status_code == 200
    assert res.json()["lunch_dish_id"] == d.id
    assert res.json()["lunch_dish"]["name"] == "Plat midi"

    # Le soir n'est pas affecté par le midi
    d2 = make_dish(session, household.id, "Plat soir")
    res = client.put(
        "/api/plan/2026-07-20", json={"main_dish_id": d2.id}, headers=auth_headers
    )
    assert res.json()["lunch_dish_id"] == d.id
    assert res.json()["main_dish_id"] == d2.id


def test_plan_lunch_clear(client, household, auth_headers, session):
    d = make_dish(session, household.id, "Plat midi")
    client.put(
        "/api/plan/2026-07-21",
        json={"lunch_dish_id": d.id, "free_text": "Soir spécial"},
        headers=auth_headers,
    )
    # Vider le midi via null explicite ne touche pas le soir
    res = client.put(
        "/api/plan/2026-07-21",
        json={"lunch_dish_id": None, "lunch_free_text": None},
        headers=auth_headers,
    )
    assert res.status_code == 200
    assert res.json()["lunch_dish_id"] is None
    assert res.json()["free_text"] == "Soir spécial"


def test_plan_lunch_untouched_when_absent(client, household, auth_headers, session):
    d = make_dish(session, household.id, "Plat midi")
    client.put(
        "/api/plan/2026-07-22", json={"lunch_free_text": "Restes"}, headers=auth_headers
    )
    # Un PUT sans clés lunch (ex. Remplir la semaine) laisse le midi intact
    res = client.put(
        "/api/plan/2026-07-22", json={"main_dish_id": d.id}, headers=auth_headers
    )
    assert res.json()["lunch_free_text"] == "Restes"


def test_plan_extra_dishes(client, household, auth_headers, session):
    d1 = make_dish(session, household.id, "Plat principal")
    d2 = make_dish(session, household.id, "Accompagnement")
    d3 = make_dish(session, household.id, "Deuxieme plat")
    res = client.put(
        "/api/plan/2026-07-23",
        json={"main_dish_id": d1.id, "extra_dish_ids": [d2.id, d3.id]},
        headers=auth_headers,
    )
    assert res.status_code == 200
    assert res.json()["extra_dish_ids"] == [d2.id, d3.id]
    assert [d["name"] for d in res.json()["extra_dishes"]] == ["Accompagnement", "Deuxieme plat"]

    # Vider les plats supplémentaires via [] ne touche pas au principal
    res = client.put(
        "/api/plan/2026-07-23", json={"extra_dish_ids": []}, headers=auth_headers
    )
    assert res.json()["extra_dishes"] == []
    assert res.json()["main_dish_id"] == d1.id


def test_plan_extra_dishes_untouched_when_absent(client, household, auth_headers, session):
    d1 = make_dish(session, household.id, "Principal")
    d2 = make_dish(session, household.id, "Extra")
    client.put(
        "/api/plan/2026-07-24",
        json={"main_dish_id": d1.id, "extra_dish_ids": [d2.id]},
        headers=auth_headers,
    )
    # Un PUT sans la clé extra_dish_ids laisse les plats supplémentaires intacts
    res = client.put(
        "/api/plan/2026-07-24", json={"free_text": "Autre"}, headers=auth_headers
    )
    assert res.json()["extra_dish_ids"] == [d2.id]


def test_plan_apero_sauce(client, household, auth_headers, session):
    """Apéro et sauce du jour : sélection puis désélection via null explicite."""
    ap = make_dish(session, household.id, "Samoussas", "apero")
    sa = make_dish(session, household.id, "Sauce yassa", "sauce")
    res = client.put(
        "/api/plan/2026-07-25",
        json={"apero_dish_id": ap.id, "sauce_dish_id": sa.id},
        headers=auth_headers,
    )
    assert res.status_code == 200
    assert res.json()["apero_dish"]["name"] == "Samoussas"
    assert res.json()["sauce_dish"]["name"] == "Sauce yassa"

    # Désélection (« — Aucun — » dans la liste déroulante)
    res = client.put("/api/plan/2026-07-25", json={"apero_dish_id": None}, headers=auth_headers)
    assert res.json()["apero_dish"] is None
    assert res.json()["sauce_dish"]["name"] == "Sauce yassa"  # non envoyé → intact
