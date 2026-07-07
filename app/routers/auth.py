import logging
import secrets
import time
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlmodel import Session, delete, func, select
from app.db import get_session
from app.models import AuthThrottle, Household, Member
from app.auth import (
    hash_password,
    verify_password,
    create_token,
    create_reset_token,
    decode_token,
    get_current_member,
    get_current_owner,
    resolve_registration_household,
)
from app.schemas import (
    LoginRequest,
    LoginResponse,
    RegisterRequest,
    InviteRead,
    ForgotPasswordRequest,
    PasswordChangeRequest,
    ResetPasswordRequest,
)
from app.services.mailer import send_email
from app.config import settings as app_config

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["auth"])

_MAX_ATTEMPTS = 10
_WINDOW_SECONDS = 300


def _enforce_rate_limit(session: Session, bucket: str, ip: str) -> None:
    """Rate-limit persistant en base : survit aux redémarrages et vaut pour
    tous les workers. Les lignes expirées sont purgées au passage."""
    now = time.time()
    cutoff = now - _WINDOW_SECONDS
    key = f"{bucket}:{ip}"
    session.exec(delete(AuthThrottle).where(AuthThrottle.ts < cutoff))
    count = session.exec(
        select(func.count()).select_from(AuthThrottle).where(AuthThrottle.key == key)
    ).one()
    if count >= _MAX_ATTEMPTS:
        session.commit()
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Trop de tentatives. Réessayez dans quelques minutes.",
            headers={"Retry-After": str(_WINDOW_SECONDS)},
        )
    session.add(AuthThrottle(key=key, ts=now))
    session.commit()


def _clear_rate_limit(session: Session, bucket: str, ip: str) -> None:
    session.exec(delete(AuthThrottle).where(AuthThrottle.key == f"{bucket}:{ip}"))
    session.commit()


@router.post("/register", response_model=LoginResponse, status_code=201)
def register(body: RegisterRequest, request: Request, session: Session = Depends(get_session)):
    ip = request.client.host if request.client else "unknown"
    _enforce_rate_limit(session, "register", ip)

    if len(body.password) < 8:
        raise HTTPException(status_code=400, detail="Le mot de passe doit contenir au moins 8 caractères")
    if len(body.password) > 128:
        raise HTTPException(status_code=400, detail="Le mot de passe est trop long (128 caractères max.)")

    normalized_email = body.email.lower().strip()

    existing_email = session.exec(select(Member).where(Member.email == normalized_email)).first()
    if existing_email:
        raise HTTPException(status_code=409, detail="Cette adresse email est déjà utilisée")

    # Multi-foyers : invitation → rejoint ce foyer ; emails du foyer d'origine →
    # base de recettes complète ; sinon nouveau foyer vide dont l'inscrit est propriétaire.
    household, is_owner, err = resolve_registration_household(
        session, normalized_email, body.name, body.invite_code
    )
    if err:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Code d'invitation invalide ou expiré",
        )

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

    logger.info("register.ok ip=%s member_id=%s is_owner=%s", ip, member.id, is_owner)
    token = create_token(member.id, member.token_version)
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
    _enforce_rate_limit(session, "login", ip)

    normalized_email = body.email.lower().strip()
    member = session.exec(select(Member).where(Member.email == normalized_email)).first()

    if not member or not member.password_hash or not verify_password(body.password, member.password_hash):
        logger.warning("login.fail ip=%s email=%s", ip, normalized_email)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Email ou mot de passe incorrect")

    _clear_rate_limit(session, "login", ip)
    logger.info("login.ok ip=%s member_id=%s", ip, member.id)
    household = session.get(Household, member.household_id)
    token = create_token(member.id, member.token_version)
    return LoginResponse(
        token=token,
        household_id=household.id,
        household_name=household.name,
        member_id=member.id,
        member_name=member.name,
        is_owner=member.is_owner,
    )


@router.post("/password/forgot")
def forgot_password(body: ForgotPasswordRequest, request: Request, session: Session = Depends(get_session)):
    """Envoie un lien de réinitialisation. Répond toujours OK pour ne pas
    révéler si un compte existe."""
    ip = request.client.host if request.client else "unknown"
    _enforce_rate_limit(session, "register", ip)

    normalized_email = body.email.lower().strip()
    member = session.exec(select(Member).where(Member.email == normalized_email)).first()
    if member:
        token = create_reset_token(member)
        link = f"{app_config.app_base_url.rstrip('/')}/#/reinitialisation?token={token}"
        sent = send_email(
            member.email,
            "Réinitialisation de votre mot de passe — Menus Famille",
            f"""Bonjour {member.name},

Vous avez demandé la réinitialisation de votre mot de passe sur Menus Famille.

Cliquez sur ce lien (valable 30 minutes) :
{link}

Si vous n'êtes pas à l'origine de cette demande, ignorez cet email :
votre mot de passe reste inchangé.

— Menus Famille · menuenfamille.fr""",
        )
        if not sent:
            # SMTP absent (dev) : le lien est journalisé côté serveur, jamais renvoyé au client
            logger.warning("password.forgot email non envoyé member_id=%s — lien: %s", member.id, link)
        else:
            logger.info("password.forgot email envoyé member_id=%s", member.id)
    else:
        logger.info("password.forgot email inconnu ip=%s", ip)
    return {"ok": True}


@router.post("/password/reset", response_model=LoginResponse)
def reset_password(body: ResetPasswordRequest, session: Session = Depends(get_session)):
    """Consomme un jeton de réinitialisation et définit le nouveau mot de passe."""
    payload = decode_token(body.token)
    if payload.get("purpose") != "pwreset":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token invalide")
    member = session.get(Member, int(payload["sub"]))
    if not member or payload.get("ver", -1) != member.token_version:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Lien expiré ou déjà utilisé — refaites une demande",
        )

    member.password_hash = hash_password(body.new_password)
    # Invalide le jeton de réinitialisation ET toutes les sessions existantes
    member.token_version += 1
    session.add(member)
    session.commit()
    session.refresh(member)

    logger.info("password.reset ok member_id=%s", member.id)
    household = session.get(Household, member.household_id)
    token = create_token(member.id, member.token_version)
    return LoginResponse(
        token=token,
        household_id=household.id,
        household_name=household.name,
        member_id=member.id,
        member_name=member.name,
        is_owner=member.is_owner,
    )


@router.post("/password", response_model=LoginResponse)
def change_password(
    body: PasswordChangeRequest,
    request: Request,
    member: Member = Depends(get_current_member),
    session: Session = Depends(get_session),
):
    ip = request.client.host if request.client else "unknown"
    _enforce_rate_limit(session, "login", ip)

    if not member.password_hash or not verify_password(body.current_password, member.password_hash):
        logger.warning("password.fail ip=%s member_id=%s", ip, member.id)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Mot de passe actuel incorrect")

    member.password_hash = hash_password(body.new_password)
    # Révoque tous les tokens existants ; un nouveau token est renvoyé au client
    member.token_version += 1
    session.add(member)
    session.commit()
    session.refresh(member)

    _clear_rate_limit(session, "login", ip)
    logger.info("password.ok member_id=%s", member.id)
    household = session.get(Household, member.household_id)
    token = create_token(member.id, member.token_version)
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
    household.invite_code_created_at = datetime.now(timezone.utc)
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
