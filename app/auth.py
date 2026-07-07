from datetime import datetime, timedelta, timezone
from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlmodel import Session
from app.config import settings
from app.db import get_session
from app.models import Household, Member, Settings as HouseholdSettings

pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")
bearer = HTTPBearer(auto_error=False)

ALGORITHM = "HS256"
TOKEN_EXPIRE_DAYS = 30
INVITE_CODE_TTL_DAYS = 7


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    return pwd_context.verify(password, hashed)


def create_token(member_id: int, token_version: int = 0) -> str:
    data = {
        "sub": str(member_id),
        "ver": token_version,
        "exp": datetime.now(timezone.utc) + timedelta(days=TOKEN_EXPIRE_DAYS),
    }
    return jwt.encode(data, settings.secret_key, algorithm=ALGORITHM)


def invite_code_valid(household: Household) -> bool:
    """Un code d'invitation expire INVITE_CODE_TTL_DAYS après sa création."""
    if not household.invite_code:
        return False
    created = household.invite_code_created_at
    if created is None:
        return False
    if created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) - created <= timedelta(days=INVITE_CODE_TTL_DAYS)


def decode_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Token invalide"
        )


def _member_from_payload(payload: dict, session: Session) -> Member:
    member_id = int(payload["sub"])
    member = session.get(Member, member_id)
    if not member:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Compte introuvable"
        )
    # Un token émis avant un changement de mot de passe porte une version
    # antérieure : il est révoqué.
    if payload.get("ver", 0) != member.token_version:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Session révoquée"
        )
    return member


def get_current_household(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
    session: Session = Depends(get_session),
) -> Household:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Non authentifié"
        )
    payload = decode_token(credentials.credentials)
    member = _member_from_payload(payload, session)
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
    return _member_from_payload(payload, session)


def get_current_owner(
    member: Member = Depends(get_current_member),
) -> Member:
    if not member.is_owner:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Réservé au propriétaire du foyer",
        )
    return member


def member_has_premium(member: Member, session: Session) -> bool:
    """Le membre a-t-il acces aux fonctionnalites premium ?

    Vrai si le freemium est desactive, si le membre est proprietaire,
    ou s'il a recu une autorisation premium du proprietaire.
    """
    if member.is_owner or getattr(member, "is_premium", False):
        return True
    sett = session.get(HouseholdSettings, member.household_id)
    return not (getattr(sett, "freemium_enabled", False) if sett else False)


def require_premium(
    member: Member = Depends(get_current_member),
    session: Session = Depends(get_session),
) -> Member:
    if not member_has_premium(member, session):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Fonctionnalité premium — demandez l'accès au propriétaire du foyer",
        )
    return member


# ── Quota d'imports gratuits (freemium actif, membre non premium) ─────────────

def _quota_month() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m")


def import_quota_state(member: Member, session: Session) -> tuple[bool, int]:
    """Retourne (illimité, imports restants ce mois-ci)."""
    if member_has_premium(member, session):
        return True, -1
    used = member.import_count if getattr(member, "import_month", None) == _quota_month() else 0
    return False, max(0, settings.import_free_limit - used)


def check_import_quota(
    member: Member = Depends(get_current_member),
    session: Session = Depends(get_session),
) -> Member:
    unlimited, remaining = import_quota_state(member, session)
    if not unlimited and remaining <= 0:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"Limite mensuelle d'imports gratuits atteinte ({settings.import_free_limit}/mois) — "
                "demandez l'accès premium au propriétaire du foyer"
            ),
        )
    return member


def consume_import_quota(member: Member, session: Session) -> None:
    """Décompte un import du quota mensuel (sans effet pour les membres premium)."""
    if member_has_premium(member, session):
        return
    month = _quota_month()
    if getattr(member, "import_month", None) != month:
        member.import_month = month
        member.import_count = 0
    member.import_count += 1
    session.add(member)
    session.commit()


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
