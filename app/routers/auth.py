import hmac
import secrets
import time
from collections import defaultdict
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlmodel import Session, select
from app.db import get_session
from app.models import Household, Member
from app.auth import hash_password, verify_password, create_token, get_current_owner
from app.schemas import LoginRequest, LoginResponse, RegisterRequest, InviteRead

router = APIRouter(prefix="/api", tags=["auth"])

_MAX_ATTEMPTS = 10
_WINDOW_SECONDS = 300
_login_attempts: dict[str, list[float]] = defaultdict(list)
_register_attempts: dict[str, list[float]] = defaultdict(list)


def _enforce_rate_limit(store: dict, ip: str) -> None:
    now = time.time()
    cutoff = now - _WINDOW_SECONDS
    attempts = [t for t in store[ip] if t > cutoff]
    if len(attempts) >= _MAX_ATTEMPTS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Trop de tentatives. Réessayez dans quelques minutes.",
            headers={"Retry-After": str(_WINDOW_SECONDS)},
        )
    attempts.append(now)
    store[ip] = attempts


@router.post("/register", response_model=LoginResponse, status_code=201)
def register(body: RegisterRequest, request: Request, session: Session = Depends(get_session)):
    ip = request.client.host if request.client else "unknown"
    _enforce_rate_limit(_register_attempts, ip)

    if len(body.password) < 8:
        raise HTTPException(status_code=400, detail="Le mot de passe doit contenir au moins 8 caractères")
    if len(body.password) > 128:
        raise HTTPException(status_code=400, detail="Le mot de passe est trop long (128 caractères max.)")

    normalized_email = body.email.lower().strip()

    household = session.exec(select(Household)).first()
    if not household:
        raise HTTPException(status_code=500, detail="Foyer non initialisé")

    existing_owner = session.exec(
        select(Member).where(Member.household_id == household.id, Member.is_owner == True)
    ).first()

    if existing_owner:
        if not body.invite_code or not household.invite_code or \
                not hmac.compare_digest(body.invite_code, household.invite_code):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Code d'invitation invalide ou requis",
            )

    existing_email = session.exec(select(Member).where(Member.email == normalized_email)).first()
    if existing_email:
        raise HTTPException(status_code=409, detail="Cette adresse email est déjà utilisée")

    is_owner = existing_owner is None
    member = Member(
        household_id=household.id,
        name=body.name,
        email=normalized_email,
        password_hash=hash_password(body.password),
        color=body.color,
        is_owner=is_owner,
    )
    session.add(member)
    session.commit()
    session.refresh(member)

    token = create_token(member.id)
    return LoginResponse(
        token=token,
        household_id=household.id,
        household_name=household.name,
        member_id=member.id,
        member_name=member.name,
        is_owner=member.is_owner,
    )


@router.post("/login", response_model=LoginResponse)
def login(body: LoginRequest, request: Request, session: Session = Depends(get_session)):
    ip = request.client.host if request.client else "unknown"
    _enforce_rate_limit(_login_attempts, ip)

    normalized_email = body.email.lower().strip()
    member = session.exec(select(Member).where(Member.email == normalized_email)).first()

    if not member or not member.password_hash or not verify_password(body.password, member.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Email ou mot de passe incorrect")

    _login_attempts.pop(ip, None)
    household = session.get(Household, member.household_id)
    token = create_token(member.id)
    return LoginResponse(
        token=token,
        household_id=household.id,
        household_name=household.name,
        member_id=member.id,
        member_name=member.name,
        is_owner=member.is_owner,
    )


@router.get("/invite", response_model=InviteRead)
def get_invite(
    owner: Member = Depends(get_current_owner),
    session: Session = Depends(get_session),
):
    household = session.get(Household, owner.household_id)
    return InviteRead(
        invite_code=household.invite_code,
        invite_code_created_at=household.invite_code_created_at,
    )


@router.post("/invite", response_model=InviteRead)
def create_invite(
    owner: Member = Depends(get_current_owner),
    session: Session = Depends(get_session),
):
    household = session.get(Household, owner.household_id)
    household.invite_code = secrets.token_urlsafe(8)
    household.invite_code_created_at = datetime.utcnow()
    session.add(household)
    session.commit()
    session.refresh(household)
    return InviteRead(
        invite_code=household.invite_code,
        invite_code_created_at=household.invite_code_created_at,
    )


@router.delete("/invite", status_code=204)
def delete_invite(
    owner: Member = Depends(get_current_owner),
    session: Session = Depends(get_session),
):
    household = session.get(Household, owner.household_id)
    household.invite_code = None
    household.invite_code_created_at = None
    session.add(household)
    session.commit()
