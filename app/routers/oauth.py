import hmac
import logging
import secrets
import time
from typing import Optional
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app.auth import create_token, invite_code_valid
from app.config import settings
from app.db import get_session
from app.models import Household, Member
from app.schemas import LoginResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["oauth"])

# ── CSRF state store ──────────────────────────────────────────────────────────

_oauth_states: dict[str, dict] = {}
_STATE_TTL = 600  # 10 min
_MAX_STATES = 1_000


def _new_state(data: dict) -> str:
    if len(_oauth_states) > _MAX_STATES:
        now = time.time()
        stale = [k for k, v in _oauth_states.items() if now > v["_exp"]]
        for k in stale:
            del _oauth_states[k]
    token = secrets.token_urlsafe(16)
    _oauth_states[token] = {**data, "_exp": time.time() + _STATE_TTL}
    return token


def _pop_state(token: str) -> Optional[dict]:
    data = _oauth_states.pop(token, None)
    if not data or time.time() > data["_exp"]:
        return None
    return data


# ── Helpers ───────────────────────────────────────────────────────────────────

def _success_redirect(member: Member) -> str:
    # Le token n'est jamais mis dans l'URL (historique navigateur) : on émet
    # un code opaque à usage unique que le front échange via POST /exchange.
    code = _new_state({"member_id": member.id})
    return f"/#/oauth-callback?{urlencode({'code': code})}"


def _find_or_create(
    session: Session,
    household: Household,
    email: str,
    name: str,
    provider: str,
    sub: str,
    invite_code: Optional[str],
) -> tuple[Optional[Member], Optional[str]]:
    """Return (member, error_key) — error_key is None on success."""
    # 1. Recherche par provider+sub
    member = session.exec(
        select(Member).where(Member.oauth_provider == provider, Member.oauth_sub == sub)
    ).first()

    # 2. Recherche par email (compte manuel existant)
    if not member:
        member = session.exec(select(Member).where(Member.email == email)).first()

    if member:
        # Lier le provider si ce n'est pas encore fait
        if member.oauth_provider is None:
            member.oauth_provider = provider
            member.oauth_sub = sub
            session.add(member)
            session.commit()
        logger.info("oauth.login provider=%s member_id=%s", provider, member.id)
        return member, None

    # 3. Nouveau membre → inscription
    existing_owner = session.exec(
        select(Member).where(Member.household_id == household.id, Member.is_owner == True)
    ).first()

    if existing_owner:
        if not invite_code or not invite_code_valid(household):
            return None, "invite_required"
        if not hmac.compare_digest(invite_code, household.invite_code):
            return None, "invalid_invite"

    is_owner = existing_owner is None
    member = Member(
        household_id=household.id,
        name=name,
        email=email,
        password_hash=None,
        oauth_provider=provider,
        oauth_sub=sub,
        color="#4B8FA6",
        is_owner=is_owner,
    )
    session.add(member)
    session.commit()
    session.refresh(member)
    logger.info("oauth.register provider=%s member_id=%s is_owner=%s", provider, member.id, is_owner)
    return member, None


# ── Google OAuth ──────────────────────────────────────────────────────────────

_GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth"
_GOOGLE_TOKEN = "https://oauth2.googleapis.com/token"
_GOOGLE_USERINFO = "https://www.googleapis.com/oauth2/v3/userinfo"


@router.get("/google")
def google_start(
    request: Request,
    invite_code: Optional[str] = Query(default=None, max_length=20),
):
    if not settings.google_client_id:
        return RedirectResponse("/#/login?oauth_error=not_configured")
    redirect_uri = str(request.base_url).rstrip("/") + "/api/auth/google/callback"
    state = _new_state({"invite_code": invite_code, "redirect_uri": redirect_uri})
    params = urlencode({
        "client_id": settings.google_client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "access_type": "online",
        "prompt": "select_account",
    })
    return RedirectResponse(f"{_GOOGLE_AUTH}?{params}")


@router.get("/google/callback")
def google_callback(
    code: Optional[str] = None,
    state: Optional[str] = None,
    error: Optional[str] = None,
    session: Session = Depends(get_session),
):
    if error or not code or not state:
        return RedirectResponse("/#/login?oauth_error=cancelled")

    state_data = _pop_state(state)
    if not state_data:
        return RedirectResponse("/#/login?oauth_error=invalid_state")

    redirect_uri = state_data["redirect_uri"]
    invite_code = state_data.get("invite_code")

    try:
        with httpx.Client(timeout=10) as client:
            tok = client.post(_GOOGLE_TOKEN, data={
                "code": code,
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            })
            tok.raise_for_status()
            access_token = tok.json().get("access_token")
            if not access_token:
                return RedirectResponse("/#/login?oauth_error=no_token")

            info = client.get(
                _GOOGLE_USERINFO,
                headers={"Authorization": f"Bearer {access_token}"},
            )
            info.raise_for_status()
            info = info.json()
    except Exception as exc:
        logger.error("google_callback: %s", exc)
        return RedirectResponse("/#/login?oauth_error=google_error")

    sub = info.get("sub", "")
    email = (info.get("email") or "").lower().strip()
    name = (info.get("name") or email.split("@")[0] or "Membre")[:50]

    if not sub or not email:
        return RedirectResponse("/#/login?oauth_error=no_email")

    household = session.exec(select(Household)).first()
    if not household:
        return RedirectResponse("/#/login?oauth_error=no_household")

    member, err = _find_or_create(session, household, email, name, "google", sub, invite_code)
    if err:
        return RedirectResponse(f"/#/login?oauth_error={err}")

    return RedirectResponse(_success_redirect(member))


# ── Échange code → token ──────────────────────────────────────────────────────

class ExchangeRequest(BaseModel):
    code: str = Field(max_length=64)


@router.post("/exchange", response_model=LoginResponse)
def exchange_code(body: ExchangeRequest, session: Session = Depends(get_session)):
    """Échange le code à usage unique émis par le callback OAuth contre un token."""
    data = _pop_state(body.code)
    if not data or "member_id" not in data:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Code invalide ou expiré",
        )
    member = session.get(Member, data["member_id"])
    if not member:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Compte introuvable"
        )
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


