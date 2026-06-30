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


def _enrich(entry: PlanEntry, session: Session) -> PlanEntryRead:
    main_dish = session.get(Dish, entry.main_dish_id) if entry.main_dish_id else None
    dessert = session.get(Dish, entry.dessert_dish_id) if entry.dessert_dish_id else None
    entree = session.get(Dish, entry.entree_dish_id) if getattr(entry, "entree_dish_id", None) else None

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
        planned_by=entry.planned_by,
        cooked=entry.cooked,
        cooked_by=entry.cooked_by,
        cooked_at=entry.cooked_at,
        updated_at=entry.updated_at,
        main_dish=to_dish_read(main_dish),
        dessert_dish=to_dish_read(dessert),
        entree_dish=to_dish_read(entree),
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
    return [_enrich(e, session) for e in entries]


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
