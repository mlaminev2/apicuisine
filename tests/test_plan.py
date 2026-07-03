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
