import time
from collections import defaultdict
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlmodel import Session, select
from app.db import get_session
from app.models import Household
from app.auth import verify_passcode, create_token
from app.schemas import LoginRequest, LoginResponse

router = APIRouter(prefix="/api", tags=["auth"])

_MAX_LOGIN_ATTEMPTS = 10
_LOGIN_WINDOW_SECONDS = 300
_login_attempts: dict[str, list[float]] = defaultdict(list)


def _enforce_login_rate_limit(ip: str) -> None:
    now = time.time()
    cutoff = now - _LOGIN_WINDOW_SECONDS
    attempts = [t for t in _login_attempts[ip] if t > cutoff]
    if len(attempts) >= _MAX_LOGIN_ATTEMPTS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Trop de tentatives. Réessayez dans quelques minutes.",
            headers={"Retry-After": str(_LOGIN_WINDOW_SECONDS)},
        )
    attempts.append(now)
    _login_attempts[ip] = attempts


@router.post("/login", response_model=LoginResponse)
def login(body: LoginRequest, request: Request, session: Session = Depends(get_session)):
    ip = request.client.host if request.client else "unknown"
    _enforce_login_rate_limit(ip)

    household = session.exec(select(Household)).first()
    if not household or not verify_passcode(body.passcode, household.passcode_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Code incorrect"
        )
    _login_attempts.pop(ip, None)
    token = create_token(household.id, body.member_id)
    return LoginResponse(
        token=token,
        household_id=household.id,
        household_name=household.name,
        member_id=body.member_id,
    )
