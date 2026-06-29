from datetime import date
from typing import Optional
from sqlmodel import Session, select
from app.models import Dish, PlanEntry


def cook_counts(
    session: Session,
    household_id: int,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
) -> dict[int, int]:
    stmt = select(PlanEntry).where(
        PlanEntry.household_id == household_id,
        PlanEntry.cooked,
    )
    if date_from:
        stmt = stmt.where(PlanEntry.date >= date_from)
    if date_to:
        stmt = stmt.where(PlanEntry.date <= date_to)
    entries = session.exec(stmt).all()

    counts: dict[int, int] = {}
    for entry in entries:
        if entry.main_dish_id is not None:
            counts[entry.main_dish_id] = counts.get(entry.main_dish_id, 0) + 1
        if entry.dessert_dish_id is not None:
            counts[entry.dessert_dish_id] = counts.get(entry.dessert_dish_id, 0) + 1
    return counts


def priority_order(
    dishes: list[Dish],
    counts: dict[int, int],
    category: Optional[str] = None,
) -> list[Dish]:
    filtered = [
        d for d in dishes if d.active and (category is None or d.category == category)
    ]
    return sorted(filtered, key=lambda d: (counts.get(d.id, 0), d.seed_order))
