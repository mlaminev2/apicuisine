import json
from datetime import date, datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select
from app.db import get_session
from app.models import Household, Dish, PlanEntry
from app.auth import get_current_household
from app.schemas import PlanEntryRead, PlanEntryUpdate, PlanEntryPatch, DishRead

router = APIRouter(prefix="/api", tags=["plan"])


def _parse_date(date_str: str) -> date:
    try:
        return date.fromisoformat(date_str)
    except ValueError:
        raise HTTPException(status_code=422, detail="Format de date invalide (attendu : YYYY-MM-DD)")


def _entry_dish_ids(entry: PlanEntry) -> list[int]:
    ids = [entry.main_dish_id, entry.dessert_dish_id,
           getattr(entry, "entree_dish_id", None), getattr(entry, "lunch_dish_id", None)]
    try:
        ids.extend(json.loads(getattr(entry, "extra_dishes", "[]") or "[]"))
    except ValueError:
        pass
    return [i for i in ids if i]


def _enrich(entry: PlanEntry, session: Session, dish_map: dict | None = None) -> PlanEntryRead:
    def _dish(dish_id):
        if not dish_id:
            return None
        if dish_map is not None:
            return dish_map.get(dish_id)
        return session.get(Dish, dish_id)

    main_dish = _dish(entry.main_dish_id)
    dessert = _dish(entry.dessert_dish_id)
    entree = _dish(getattr(entry, "entree_dish_id", None))
    lunch = _dish(getattr(entry, "lunch_dish_id", None))
    try:
        extra_ids = json.loads(getattr(entry, "extra_dishes", "[]") or "[]")
    except ValueError:
        extra_ids = []
    extras = [d for d in (_dish(i) for i in extra_ids) if d]

    def to_dish_read(d: Optional[Dish]) -> Optional[DishRead]:
        if not d:
            return None
        return DishRead(
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
        )

    return PlanEntryRead(
        id=entry.id,
        household_id=entry.household_id,
        date=entry.date,
        main_dish_id=entry.main_dish_id,
        dessert_dish_id=entry.dessert_dish_id,
        entree_dish_id=getattr(entry, "entree_dish_id", None),
        free_text=entry.free_text,
        lunch_dish_id=getattr(entry, "lunch_dish_id", None),
        lunch_free_text=getattr(entry, "lunch_free_text", None),
        extra_dish_ids=[d.id for d in extras],
        planned_by=entry.planned_by,
        cooked=entry.cooked,
        cooked_by=entry.cooked_by,
        cooked_at=entry.cooked_at,
        updated_at=entry.updated_at,
        main_dish=to_dish_read(main_dish),
        dessert_dish=to_dish_read(dessert),
        entree_dish=to_dish_read(entree),
        lunch_dish=to_dish_read(lunch),
        extra_dishes=[to_dish_read(d) for d in extras],
    )


@router.get("/plan", response_model=list[PlanEntryRead])
def list_plan(
    from_: Optional[str] = Query(default=None, alias="from"),
    to: Optional[str] = None,
    household: Household = Depends(get_current_household),
    session: Session = Depends(get_session),
):
    stmt = select(PlanEntry).where(PlanEntry.household_id == household.id)
    try:
        if from_:
            stmt = stmt.where(PlanEntry.date >= date.fromisoformat(from_))
        if to:
            stmt = stmt.where(PlanEntry.date <= date.fromisoformat(to))
    except ValueError:
        raise HTTPException(status_code=422, detail="Format de date invalide (attendu : YYYY-MM-DD)")
    entries = session.exec(stmt).all()
    # Chargement groupé : une seule requête pour tous les plats du calendrier
    ids = {i for e in entries for i in _entry_dish_ids(e)}
    dish_map = (
        {d.id: d for d in session.exec(select(Dish).where(Dish.id.in_(ids))).all()}
        if ids else {}
    )
    return [_enrich(e, session, dish_map) for e in entries]


@router.put("/plan/{date_str}", response_model=PlanEntryRead)
def upsert_plan(
    date_str: str,
    body: PlanEntryUpdate,
    household: Household = Depends(get_current_household),
    session: Session = Depends(get_session),
):
    d = _parse_date(date_str)
    entry = session.exec(
        select(PlanEntry).where(
            PlanEntry.household_id == household.id, PlanEntry.date == d
        )
    ).first()
    if not entry:
        entry = PlanEntry(household_id=household.id, date=d)
    if body.main_dish_id is not None:
        entry.main_dish_id = body.main_dish_id
    if body.dessert_dish_id is not None:
        entry.dessert_dish_id = body.dessert_dish_id
    if body.entree_dish_id is not None:
        entry.entree_dish_id = body.entree_dish_id
    if body.free_text is not None:
        entry.free_text = body.free_text
    # Les champs du midi utilisent exclude_unset : envoyer explicitement null
    # permet de vider le menu du midi sans toucher au reste du jour.
    sent = body.model_dump(exclude_unset=True)
    if "lunch_dish_id" in sent:
        entry.lunch_dish_id = body.lunch_dish_id
    if "lunch_free_text" in sent:
        entry.lunch_free_text = body.lunch_free_text
    if "extra_dish_ids" in sent:
        entry.extra_dishes = json.dumps(body.extra_dish_ids or [])
    if body.planned_by is not None:
        entry.planned_by = body.planned_by
    entry.updated_at = datetime.now(timezone.utc)
    session.add(entry)
    session.commit()
    session.refresh(entry)
    return _enrich(entry, session)


@router.patch("/plan/{date_str}", response_model=PlanEntryRead)
def patch_plan(
    date_str: str,
    body: PlanEntryPatch,
    household: Household = Depends(get_current_household),
    session: Session = Depends(get_session),
):
    d = _parse_date(date_str)
    entry = session.exec(
        select(PlanEntry).where(
            PlanEntry.household_id == household.id, PlanEntry.date == d
        )
    ).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Entrée introuvable")
    entry.cooked = body.cooked
    if body.cooked_by is not None:
        entry.cooked_by = body.cooked_by
    entry.cooked_at = datetime.now(timezone.utc) if body.cooked else None
    entry.updated_at = datetime.now(timezone.utc)
    session.add(entry)
    session.commit()
    session.refresh(entry)
    return _enrich(entry, session)


@router.delete("/plan/{date_str}")
def delete_plan(
    date_str: str,
    household: Household = Depends(get_current_household),
    session: Session = Depends(get_session),
):
    d = _parse_date(date_str)
    entry = session.exec(
        select(PlanEntry).where(
            PlanEntry.household_id == household.id, PlanEntry.date == d
        )
    ).first()
    if entry:
        session.delete(entry)
        session.commit()
    return {"ok": True}
