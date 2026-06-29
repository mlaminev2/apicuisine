from datetime import date
from typing import Optional
from sqlmodel import Session, select
from app.models import Dish
from app.services.priority import cook_counts


def get_tracking(
    session: Session,
    household_id: int,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
) -> list[dict]:
    dishes = session.exec(
        select(Dish).where(Dish.household_id == household_id, Dish.active)
    ).all()
    counts = cook_counts(session, household_id, date_from, date_to)
    result = []
    for dish in dishes:
        count = counts.get(dish.id, 0)
        status = "à prioriser" if count == 0 else f"fait {count}x"
        result.append(
            {
                "dish": dish,
                "category": dish.category,
                "count": count,
                "status": status,
            }
        )
    return result
