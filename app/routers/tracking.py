from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlmodel import Session
from app.db import get_session
from app.models import Household
from app.auth import get_current_household
from app.schemas import TrackingEntry, DishRead
from app.services.tracking import get_tracking

router = APIRouter(prefix="/api", tags=["tracking"])


@router.get("/tracking", response_model=list[TrackingEntry])
def tracking(
    from_: Optional[str] = Query(default=None, alias="from"),
    to: Optional[str] = None,
    household: Household = Depends(get_current_household),
    session: Session = Depends(get_session),
):
    date_from = date.fromisoformat(from_) if from_ else None
    date_to = date.fromisoformat(to) if to else None
    results = get_tracking(session, household.id, date_from, date_to)
    return [
        TrackingEntry(
            dish=DishRead(
                id=r["dish"].id,
                name=r["dish"].name,
                category=r["dish"].category,
                source_tag=r["dish"].source_tag,
                seed_order=r["dish"].seed_order,
                active=r["dish"].active,
                created_at=r["dish"].created_at,
                source_url=r["dish"].source_url,
                thumbnail_url=r["dish"].thumbnail_url,
                author=r["dish"].author,
            ),
            category=r["category"],
            count=r["count"],
            status=r["status"],
        )
        for r in results
    ]
