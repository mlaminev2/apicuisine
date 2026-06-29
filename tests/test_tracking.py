from app.models import Dish, PlanEntry
from datetime import date


def test_tracking_empty(client, household, auth_headers):
    res = client.get("/api/tracking", headers=auth_headers)
    assert res.status_code == 200
    assert isinstance(res.json(), list)


def test_tracking_counts(client, household, auth_headers, session):
    d = Dish(household_id=household.id, name="Plat suivi", category="riz", seed_order=0)
    session.add(d)
    session.commit()
    session.refresh(d)

    entry = PlanEntry(
        household_id=household.id,
        date=date(2026, 7, 10),
        main_dish_id=d.id,
        cooked=True,
    )
    session.add(entry)
    session.commit()

    res = client.get("/api/tracking", headers=auth_headers)
    items = res.json()
    plat = next((i for i in items if i["dish"]["id"] == d.id), None)
    assert plat is not None
    assert plat["count"] == 1
    assert plat["status"] == "fait 1x"


def test_tracking_priority_status(client, household, auth_headers, session):
    d = Dish(
        household_id=household.id, name="Jamais cuisiné", category="autre", seed_order=0
    )
    session.add(d)
    session.commit()
    session.refresh(d)

    res = client.get("/api/tracking", headers=auth_headers)
    items = res.json()
    plat = next((i for i in items if i["dish"]["id"] == d.id), None)
    assert plat["count"] == 0
    assert plat["status"] == "à prioriser"
