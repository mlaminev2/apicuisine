from app.models import Dish, PlanEntry
from datetime import date

# 2026-07-06 = lundi → pomme_de_terre
# 2026-07-02 = jeudi → pomme_de_terre
# 2026-07-13 = lundi suivant → pomme_de_terre


def make_dish(session, hh_id, name, category="pomme_de_terre", seed_order=0):
    d = Dish(household_id=hh_id, name=name, category=category, seed_order=seed_order)
    session.add(d)
    session.commit()
    session.refresh(d)
    return d


def test_priority_never_cooked_first(client, household, auth_headers, session):
    d1 = make_dish(session, household.id, "Plat A", seed_order=0)
    make_dish(session, household.id, "Plat B", seed_order=1)
    entry = PlanEntry(
        household_id=household.id,
        date=date(2026, 7, 1),
        main_dish_id=d1.id,
        cooked=True,
    )
    session.add(entry)
    session.commit()

    res = client.get("/api/priority?date=2026-07-02", headers=auth_headers)
    assert res.status_code == 200
    names = [i["dish"]["name"] for i in res.json()]
    assert names.index("Plat B") < names.index("Plat A")


def test_priority_cooked_dish_goes_down(client, household, auth_headers, session):
    """F20: after marking cooked=true, dish descends in priority list."""
    d1 = make_dish(session, household.id, "PrioA", seed_order=0)
    make_dish(session, household.id, "PrioB", seed_order=1)

    # 2026-07-06 = lundi → pomme_de_terre
    res = client.get("/api/priority?date=2026-07-06", headers=auth_headers)
    names_before = [i["dish"]["name"] for i in res.json()]
    assert names_before.index("PrioA") < names_before.index("PrioB")

    client.put(
        "/api/plan/2026-07-06", json={"main_dish_id": d1.id}, headers=auth_headers
    )
    client.patch("/api/plan/2026-07-06", json={"cooked": True}, headers=auth_headers)

    # 2026-07-13 = lundi suivant → pomme_de_terre
    res = client.get("/api/priority?date=2026-07-13", headers=auth_headers)
    names_after = [i["dish"]["name"] for i in res.json()]
    assert names_after.index("PrioB") < names_after.index("PrioA")


def test_priority_never_cooked_badge(client, household, auth_headers, session):
    make_dish(session, household.id, "NeverCooked", seed_order=0)
    # 2026-07-06 = lundi → pomme_de_terre
    res = client.get("/api/priority?date=2026-07-06", headers=auth_headers)
    item = next(i for i in res.json() if i["dish"]["name"] == "NeverCooked")
    assert item["never_cooked"] is True
    assert item["cook_count"] == 0


def test_priority_stable_sort(client, household, auth_headers, session):
    """Equal cook counts → seed_order preserved."""
    make_dish(session, household.id, "First", seed_order=0)
    make_dish(session, household.id, "Second", seed_order=1)
    make_dish(session, household.id, "Third", seed_order=2)
    # 2026-07-06 = lundi → pomme_de_terre
    res = client.get("/api/priority?date=2026-07-06", headers=auth_headers)
    names = [i["dish"]["name"] for i in res.json()]
    assert names.index("First") < names.index("Second") < names.index("Third")
