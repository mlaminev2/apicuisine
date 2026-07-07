import json
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from app.db import get_session
from app.models import (
    Dish,
    Household,
    IngredientMap,
    Member,
    PlanEntry,
    Settings,
    ShoppingCategory,
    ShoppingList,
)
from app.auth import get_current_household, get_current_member
from app.schemas import SettingsRead, SettingsUpdate

router = APIRouter(prefix="/api", tags=["settings"])


def _to_read(s: Settings) -> SettingsRead:
    return SettingsRead(
        weekday_category_map=json.loads(s.weekday_category_map),
        dessert_enabled=s.dessert_enabled,
        lunch_enabled=getattr(s, "lunch_enabled", False),
        multi_dish_enabled=getattr(s, "multi_dish_enabled", False),
        freemium_enabled=getattr(s, "freemium_enabled", False),
    )


@router.get("/settings", response_model=SettingsRead)
def get_settings(
    household: Household = Depends(get_current_household),
    session: Session = Depends(get_session),
):
    sett = session.get(Settings, household.id)
    if not sett:
        sett = Settings(household_id=household.id)
        session.add(sett)
        session.commit()
        session.refresh(sett)
    return _to_read(sett)


def _rows(session: Session, model, household_id: int, exclude: set[str] = frozenset()) -> list[dict]:
    rows = session.exec(select(model).where(model.household_id == household_id)).all()
    return [
        {k: v for k, v in r.model_dump().items() if k not in exclude}
        for r in rows
    ]


@router.get("/export")
def export_data(
    household: Household = Depends(get_current_household),
    session: Session = Depends(get_session),
):
    """Export complet des données du foyer (sauvegarde JSON téléchargeable).

    Les secrets (hash de mots de passe, identifiants OAuth) sont exclus.
    """
    hid = household.id
    sett = session.get(Settings, hid)
    return {
        "app": "menus-famille",
        "format_version": 1,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "household": {"id": hid, "name": household.name, "created_at": household.created_at},
        "members": _rows(
            session, Member, hid,
            exclude={"password_hash", "oauth_provider", "oauth_sub", "token_version"},
        ),
        "dishes": _rows(session, Dish, hid),
        "plan_entries": _rows(session, PlanEntry, hid),
        "shopping_lists": _rows(session, ShoppingList, hid),
        "shopping_categories": _rows(session, ShoppingCategory, hid),
        "ingredient_map": _rows(session, IngredientMap, hid),
        "settings": {
            "weekday_category_map": json.loads(sett.weekday_category_map) if sett else {},
            "dessert_enabled": sett.dessert_enabled if sett else True,
            "lunch_enabled": getattr(sett, "lunch_enabled", False) if sett else False,
            "multi_dish_enabled": getattr(sett, "multi_dish_enabled", False) if sett else False,
            "freemium_enabled": getattr(sett, "freemium_enabled", False) if sett else False,
        },
    }


@router.put("/settings", response_model=SettingsRead)
def update_settings(
    body: SettingsUpdate,
    household: Household = Depends(get_current_household),
    member: Member = Depends(get_current_member),
    session: Session = Depends(get_session),
):
    # L'activation du freemium est réservée au propriétaire
    if body.freemium_enabled is not None and not member.is_owner:
        raise HTTPException(
            status_code=403,
            detail="Seul le propriétaire du foyer peut activer ou désactiver le freemium",
        )
    sett = session.get(Settings, household.id)
    if not sett:
        sett = Settings(household_id=household.id)
    if body.weekday_category_map is not None:
        sett.weekday_category_map = json.dumps(body.weekday_category_map)
    if body.dessert_enabled is not None:
        sett.dessert_enabled = body.dessert_enabled
    if body.lunch_enabled is not None:
        sett.lunch_enabled = body.lunch_enabled
    if body.multi_dish_enabled is not None:
        sett.multi_dish_enabled = body.multi_dish_enabled
    if body.freemium_enabled is not None:
        sett.freemium_enabled = body.freemium_enabled
    sett.updated_at = datetime.now(timezone.utc)
    session.add(sett)
    session.commit()
    session.refresh(sett)
    return _to_read(sett)
