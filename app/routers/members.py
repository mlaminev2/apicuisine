from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select, update
from app.db import get_session
from app.models import Household, Member, PlanEntry
from app.auth import get_current_household, get_current_owner
from app.schemas import MemberRead

router = APIRouter(prefix="/api", tags=["members"])


@router.get("/members", response_model=list[MemberRead])
def list_members(
    household: Household = Depends(get_current_household),
    session: Session = Depends(get_session),
):
    return session.exec(select(Member).where(Member.household_id == household.id)).all()


@router.delete("/members/{member_id}", status_code=204)
def delete_member(
    member_id: int,
    owner: Member = Depends(get_current_owner),
    session: Session = Depends(get_session),
):
    target = session.get(Member, member_id)
    if not target or target.household_id != owner.household_id:
        raise HTTPException(status_code=404, detail="Membre introuvable")
    if target.is_owner:
        raise HTTPException(status_code=400, detail="Impossible de supprimer le propriétaire du foyer")
    session.exec(update(PlanEntry).where(PlanEntry.planned_by == member_id).values(planned_by=None))
    session.exec(update(PlanEntry).where(PlanEntry.cooked_by == member_id).values(cooked_by=None))
    session.delete(target)
    session.commit()
