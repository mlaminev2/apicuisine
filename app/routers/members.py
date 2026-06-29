from fastapi import APIRouter, Depends
from sqlmodel import Session, select
from app.db import get_session
from app.models import Household, Member
from app.auth import get_current_household
from app.schemas import MemberCreate, MemberRead

router = APIRouter(prefix="/api", tags=["members"])


@router.get("/members", response_model=list[MemberRead])
def list_members(
    household: Household = Depends(get_current_household),
    session: Session = Depends(get_session),
):
    return session.exec(select(Member).where(Member.household_id == household.id)).all()


@router.post("/members", response_model=MemberRead, status_code=201)
def create_member(
    body: MemberCreate,
    household: Household = Depends(get_current_household),
    session: Session = Depends(get_session),
):
    member = Member(household_id=household.id, name=body.name, color=body.color)
    session.add(member)
    session.commit()
    session.refresh(member)
    return member
