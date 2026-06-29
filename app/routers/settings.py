import json
from datetime import datetime
from fastapi import APIRouter, Depends
from sqlmodel import Session
from app.db import get_session
from app.models import Household, Settings
from app.auth import get_current_household
from app.schemas import SettingsRead, SettingsUpdate

router = APIRouter(prefix="/api", tags=["settings"])


def _to_read(s: Settings) -> SettingsRead:
    return SettingsRead(
        weekday_category_map=json.loads(s.weekday_category_map),
        dessert_enabled=s.dessert_enabled,
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


@router.put("/settings", response_model=SettingsRead)
def update_settings(
    body: SettingsUpdate,
    household: Household = Depends(get_current_household),
    session: Session = Depends(get_session),
):
    sett = session.get(Settings, household.id)
    if not sett:
        sett = Settings(household_id=household.id)
    if body.weekday_category_map is not None:
        sett.weekday_category_map = json.dumps(body.weekday_category_map)
    if body.dessert_enabled is not None:
        sett.dessert_enabled = body.dessert_enabled
    sett.updated_at = datetime.utcnow()
    session.add(sett)
    session.commit()
    session.refresh(sett)
    return _to_read(sett)
