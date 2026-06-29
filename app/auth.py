from datetime import datetime, timedelta
from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlmodel import Session
from app.config import settings
from app.db import get_session
from app.models import Household

pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")
bearer = HTTPBearer(auto_error=False)

ALGORITHM = "HS256"
TOKEN_EXPIRE_DAYS = 30


def hash_passcode(passcode: str) -> str:
    return pwd_context.hash(passcode)


def verify_passcode(passcode: str, hashed: str) -> bool:
    return pwd_context.verify(passcode, hashed)


def create_token(household_id: int, member_id: Optional[int] = None) -> str:
    data = {
        "sub": str(household_id),
        "member_id": member_id,
        "exp": datetime.utcnow() + timedelta(days=TOKEN_EXPIRE_DAYS),
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
    household_id = int(payload["sub"])
    household = session.get(Household, household_id)
    if not household:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Foyer introuvable"
        )
    return household


def get_current_member_id(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
) -> Optional[int]:
    if credentials is None:
        return None
    try:
        payload = decode_token(credentials.credentials)
        return payload.get("member_id")
    except Exception:
        return None
