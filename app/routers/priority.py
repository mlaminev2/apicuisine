from datetime import date
from fastapi import APIRouter, Depends, Query
from sqlmodel import Session, select
from typing import Optional
from app.db import get_session
from app.models import Household, Dish, Settings, PlanEntry
from app.auth import get_current_household
from app.schemas import PriorityDishRead, DishRead
from app.services.priority import cook_counts, priority_order
from app.services.calendar_utils import category_for_date
import json

router = APIRouter(prefix="/api", tags=["priority"])


@router.get("/priority", response_model=list[PriorityDishRead])
def get_priority(
    date_str: str = Query(alias="date"),
    category: Optional[str] = Query(default=None),
    household: Household = Depends(get_current_household),
    session: Session = Depends(get_session),
):
    d = date.fromisoformat(date_str)
    # « __all__ » = afficher tous les plats (aucun filtre de catégorie).
    if category == "__all__":
        effective = None
    else:
        # Catégorie effective : override explicite du paramètre (aperçu live dans
        # le picker) > catégorie enregistrée pour ce jour > défaut des réglages.
        if not category:
            entry = session.exec(
                select(PlanEntry).where(
                    PlanEntry.household_id == household.id, PlanEntry.date == d
                )
            ).first()
            category = getattr(entry, "category", None) if entry else None
        if not category:
            sett = session.get(Settings, household.id)
            mapping = json.loads(sett.weekday_category_map) if sett else {}
            category = category_for_date(d, mapping)
        effective = category

    dishes = session.exec(
        select(Dish).where(Dish.household_id == household.id, Dish.active)
    ).all()
    counts = cook_counts(session, household.id)
    ordered = priority_order(dishes, counts, effective)

    return [
        PriorityDishRead(
            dish=DishRead(
                id=d.id,
                name=d.name,
                category=d.category,
                source_tag=d.source_tag,
                seed_order=d.seed_order,
                active=d.active,
                created_at=d.created_at,
                ingredients=d.ingredients,
                instructions=d.instructions,
                source_url=d.source_url,
                thumbnail_url=d.thumbnail_url,
                author=d.author,
            ),
            cook_count=counts.get(d.id, 0),
            never_cooked=counts.get(d.id, 0) == 0,
        )
        for d in ordered
    ]
