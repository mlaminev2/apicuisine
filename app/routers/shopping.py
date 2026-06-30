import json
from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from sqlmodel import Session, select
from app.db import get_session
from app.models import Household, ShoppingList
from app.auth import get_current_household
from app.schemas import ShoppingListRead, ShoppingListUpdate, ShoppingItem, ShoppingWeekSummary
from app.routers.categories import resolve_category_id

router = APIRouter(prefix="/api", tags=["shopping"])


def _to_read(sl: ShoppingList) -> ShoppingListRead:
    items = [ShoppingItem(**i) for i in json.loads(sl.items)]
    return ShoppingListRead(iso_year=sl.iso_year, iso_week=sl.iso_week, items=items)


@router.get("/shopping", response_model=list[ShoppingWeekSummary])
def list_shopping_weeks(
    household: Household = Depends(get_current_household),
    session: Session = Depends(get_session),
):
    lists = session.exec(
        select(ShoppingList).where(ShoppingList.household_id == household.id)
    ).all()
    result = []
    for sl in sorted(lists, key=lambda x: (x.iso_year, x.iso_week), reverse=True):
        items = json.loads(sl.items)
        if items:
            result.append(ShoppingWeekSummary(
                iso_year=sl.iso_year,
                iso_week=sl.iso_week,
                item_count=len(items),
                checked_count=sum(1 for i in items if i.get("checked", False)),
            ))
    return result


@router.get("/shopping/all", response_model=list[ShoppingListRead])
def get_all_shopping(
    household: Household = Depends(get_current_household),
    session: Session = Depends(get_session),
):
    lists = session.exec(
        select(ShoppingList).where(ShoppingList.household_id == household.id)
    ).all()
    result = []
    for sl in sorted(lists, key=lambda x: (x.iso_year, x.iso_week), reverse=True):
        if json.loads(sl.items):
            result.append(_to_read(sl))
    return result


@router.get("/shopping/{iso_year}/{iso_week}", response_model=ShoppingListRead)
def get_shopping(
    iso_year: int,
    iso_week: int,
    household: Household = Depends(get_current_household),
    session: Session = Depends(get_session),
):
    sl = session.exec(
        select(ShoppingList).where(
            ShoppingList.household_id == household.id,
            ShoppingList.iso_year == iso_year,
            ShoppingList.iso_week == iso_week,
        )
    ).first()
    if not sl:
        sl = ShoppingList(
            household_id=household.id, iso_year=iso_year, iso_week=iso_week
        )
    return _to_read(sl)


@router.put("/shopping/{iso_year}/{iso_week}", response_model=ShoppingListRead)
def upsert_shopping(
    iso_year: int,
    iso_week: int,
    body: ShoppingListUpdate,
    household: Household = Depends(get_current_household),
    session: Session = Depends(get_session),
):
    sl = session.exec(
        select(ShoppingList).where(
            ShoppingList.household_id == household.id,
            ShoppingList.iso_year == iso_year,
            ShoppingList.iso_week == iso_week,
        )
    ).first()
    if not sl:
        sl = ShoppingList(
            household_id=household.id, iso_year=iso_year, iso_week=iso_week
        )
    enriched = []
    for item in body.items:
        d = item.model_dump()
        if d.get("category_id") is None:
            d["category_id"] = resolve_category_id(item.text, household.id, session)
        enriched.append(d)
    sl.items = json.dumps(enriched)
    sl.updated_at = datetime.now(timezone.utc)
    session.add(sl)
    session.commit()
    session.refresh(sl)
    return _to_read(sl)
