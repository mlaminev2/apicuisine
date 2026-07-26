"""Catégorie du jour : override par date, le défaut restant dans les réglages."""

from app.models import Dish


def make_dish(session, hh_id, name, category):
    d = Dish(household_id=hh_id, name=name, category=category)
    session.add(d)
    session.commit()
    session.refresh(d)
    return d


def test_plan_category_persists(client, household, auth_headers, session):
    d = make_dish(session, household.id, "Riz au poulet", "riz")
    res = client.put(
        "/api/plan/2026-08-03",
        json={"main_dish_id": d.id, "category": "pates"},
        headers=auth_headers,
    )
    assert res.status_code == 200
    assert res.json()["category"] == "pates"

    res = client.get("/api/plan?from=2026-08-03&to=2026-08-03", headers=auth_headers)
    assert res.json()[0]["category"] == "pates"


def test_plan_category_null_clears(client, household, auth_headers, session):
    d = make_dish(session, household.id, "Plat", "riz")
    client.put(
        "/api/plan/2026-08-04",
        json={"main_dish_id": d.id, "category": "pates"},
        headers=auth_headers,
    )
    res = client.put("/api/plan/2026-08-04", json={"category": None}, headers=auth_headers)
    assert res.json()["category"] is None


def test_plan_category_untouched_when_absent(client, household, auth_headers, session):
    d = make_dish(session, household.id, "Plat", "riz")
    client.put("/api/plan/2026-08-05", json={"category": "africain"}, headers=auth_headers)
    # Un PUT sans clé category (ex. Remplir la semaine) laisse l'override intact
    res = client.put(
        "/api/plan/2026-08-05", json={"main_dish_id": d.id}, headers=auth_headers
    )
    assert res.json()["category"] == "africain"


def test_priority_uses_explicit_category(client, household, auth_headers, session):
    make_dish(session, household.id, "Riz sauté", "riz")
    make_dish(session, household.id, "Pâtes carbo", "pates")
    res = client.get(
        "/api/priority?date=2026-08-06&category=pates", headers=auth_headers
    )
    assert [p["dish"]["name"] for p in res.json()] == ["Pâtes carbo"]


def test_priority_uses_stored_day_category(client, household, auth_headers, session):
    make_dish(session, household.id, "Riz sauté", "riz")
    make_dish(session, household.id, "Pâtes carbo", "pates")
    # Override du jour = pates (sans paramètre explicite ensuite)
    client.put("/api/plan/2026-08-07", json={"category": "pates"}, headers=auth_headers)
    res = client.get("/api/priority?date=2026-08-07", headers=auth_headers)
    assert [p["dish"]["name"] for p in res.json()] == ["Pâtes carbo"]
