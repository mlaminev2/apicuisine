from datetime import datetime, timedelta, timezone
from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlmodel import Session, select
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


def create_reset_token(member: Member) -> str:
    """Jeton de réinitialisation : 30 minutes, à usage unique (le changement de
    mot de passe incrémente token_version, ce qui l'invalide)."""
    data = {
        "sub": str(member.id),
        "ver": member.token_version,
        "purpose": "pwreset",
        "exp": datetime.now(timezone.utc) + timedelta(minutes=30),
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
    # Les jetons à usage spécial (réinitialisation) ne sont pas des sessions
    if payload.get("purpose"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Token invalide"
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


def platform_freemium_enabled(session: Session) -> bool:
    """Le freemium est un etat de PLATEFORME : la reference est le premier foyer
    (celui de l'administrateur). Les nouveaux foyers le suivent automatiquement."""
    first = session.exec(
        select(HouseholdSettings).order_by(HouseholdSettings.household_id)
    ).first()
    return bool(getattr(first, "freemium_enabled", False)) if first else False


def member_has_premium(member: Member, session: Session) -> bool:
    """Le premium est un droit PAR COMPTE : super admin, ou compte auquel
    l'administrateur a accorde is_premium. Etre proprietaire d'un foyer ne
    donne aucun droit particulier."""
    if is_super_admin(member) or getattr(member, "is_premium", False):
        return True
    return not platform_freemium_enabled(session)


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


def is_full_base_email(email: str) -> bool:
    """Emails rattaches au foyer d'origine (recettes pre-remplies)."""
    allowed = {e.strip().lower() for e in (settings.full_base_emails or "").split(",") if e.strip()}
    return (email or "").strip().lower() in allowed


def resolve_registration_household(
    session: Session, email: str, display_name: str, invite_code: Optional[str]
):
    """Determine le foyer d'un nouvel inscrit.

    - code d'invitation valide -> rejoint ce foyer (membre simple)
    - email de la liste FULL_BASE_EMAILS -> foyer d'origine (base complete)
    - sinon -> creation d'un nouveau foyer vide dont il devient proprietaire
    Retourne (household, is_owner, erreur | None).
    """
    import hmac as _hmac
    from sqlmodel import select as _select
    from app.models import Settings as _Settings

    if invite_code:
        candidates = session.exec(
            _select(Household).where(Household.invite_code != None)  # noqa: E711
        ).all()
        for hh in candidates:
            if invite_code_valid(hh) and _hmac.compare_digest(invite_code, hh.invite_code):
                return hh, False, None
        return None, False, "invalid_invite"

    if is_full_base_email(email):
        hh = session.exec(_select(Household).order_by(Household.id)).first()
        if hh:
            has_owner = session.exec(
                _select(Member).where(Member.household_id == hh.id, Member.is_owner == True)  # noqa: E712
            ).first()
            return hh, has_owner is None, None

    hh = Household(name=f"Foyer de {display_name}"[:80])
    session.add(hh)
    session.commit()
    session.refresh(hh)
    session.add(_Settings(household_id=hh.id))
    session.commit()
    return hh, True, None


def is_super_admin(member: Member) -> bool:
    """L'espace admin est reserve a l'email SUPER_ADMIN_EMAIL s'il est defini,
    sinon au proprietaire du foyer."""
    admin_email = (settings.super_admin_email or "").strip().lower()
    if admin_email:
        return (member.email or "").strip().lower() == admin_email
    return bool(member.is_owner)


def get_current_admin(
    member: Member = Depends(get_current_member),
) -> Member:
    if not is_super_admin(member):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Réservé au super administrateur",
        )
    return member


# ── Quota d'imports gratuits (freemium actif, membre non premium) ─────────────

def _quota_month() -> str:
    """Clé du mois courant, ex. « 2026-07 » (le quota est mensuel)."""
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
