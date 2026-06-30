from datetime import datetime, timedelta, timezone
from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlmodel import Session
from app.config import settings
from app.db import get_session
from app.models import Household, Member

pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")
bearer = HTTPBearer(auto_error=False)

ALGORITHM = "HS256"
TOKEN_EXPIRE_DAYS = 30


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    return pwd_context.verify(password, hashed)


def create_token(member_id: int) -> str:
    data = {
        "sub": str(member_id),
        "exp": datetime.now(timezone.utc) + timedelta(days=TOKEN_EXPIRE_DAYS),
    }
    return jwt.encode(data, settings.secret_key, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Token invalide"
        )


def get_current_household(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
    session: Session = Depends(get_session),
) -> Household:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Non authentifié"
        )
    payload = decode_token(credentials.credentials)
    member_id = int(payload["sub"])
    member = session.get(Member, member_id)
    if not member:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Compte introuvable"
        )
    household = session.get(Household, member.household_id)
    if not household:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Foyer introuvable"
        )
    return household


def get_current_member(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
    session: Session = Depends(get_session),
) -> Member:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Non authentifié"
        )
    payload = decode_token(credentials.credentials)
    member_id = int(payload["sub"])
    member = session.get(Member, member_id)
    if not member:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Compte introuvable"
        )
    return member


def get_current_owner(
    member: Member = Depends(get_current_member),
) -> Member:
    if not member.is_owner:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Réservé au propriétaire du foyer",
        )
    return member


def get_current_member_id(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
) -> Optional[int]:
    if credentials is None:
        return None
    try:
        payload = decode_token(credentials.credentials)
        return int(payload["sub"])
    except Exception:
        return None
