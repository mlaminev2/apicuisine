import hmac
import json
import logging
import secrets
import time
from typing import Optional
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, Form, Query, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlmodel import Session, select

from app.auth import create_token
from app.config import settings
from app.db import get_session
from app.models import Household, Member

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

def _success_redirect(household: Household, member: Member) -> str:
    token = create_token(member.id)
    params = urlencode({
        "token": token,
        "household_id": household.id,
        "member_id": member.id,
        "member_name": member.name,
        "is_owner": "true" if member.is_owner else "false",
    })
    return f"/#/oauth-callback?{params}"


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
        if not invite_code or not household.invite_code:
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
    invite_code: Optional[str] = Query(default=None),
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
    name = info.get("name") or email.split("@")[0] or "Membre"

    if not sub or not email:
        return RedirectResponse("/#/login?oauth_error=no_email")

    household = session.exec(select(Household)).first()
    if not household:
        return RedirectResponse("/#/login?oauth_error=no_household")

    member, err = _find_or_create(session, household, email, name, "google", sub, invite_code)
    if err:
        return RedirectResponse(f"/#/login?oauth_error={err}")

    return RedirectResponse(_success_redirect(household, member))


# ── Apple OAuth ───────────────────────────────────────────────────────────────

_APPLE_AUTH = "https://appleid.apple.com/auth/authorize"
_APPLE_TOKEN = "https://appleid.apple.com/auth/token"


def _apple_client_secret() -> str:
    """Génère le client_secret Apple : JWT ES256 signé avec la clé privée .p8."""
    from jose import jwt as jose_jwt
    now = int(time.time())
    return jose_jwt.encode(
        {
            "iss": settings.apple_team_id,
            "iat": now,
            "exp": now + 86400,
            "aud": "https://appleid.apple.com",
            "sub": settings.apple_client_id,
        },
        settings.apple_private_key,
        algorithm="ES256",
        headers={"kid": settings.apple_key_id},
    )


@router.get("/apple")
def apple_start(
    request: Request,
    invite_code: Optional[str] = Query(default=None),
):
    if not settings.apple_client_id:
        return RedirectResponse("/#/login?oauth_error=not_configured")
    redirect_uri = str(request.base_url).rstrip("/") + "/api/auth/apple/callback"
    state = _new_state({"invite_code": invite_code, "redirect_uri": redirect_uri})
    params = urlencode({
        "client_id": settings.apple_client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "name email",
        "state": state,
        "response_mode": "form_post",
    })
    return RedirectResponse(f"{_APPLE_AUTH}?{params}")


@router.post("/apple/callback")
async def apple_callback(
    code: Optional[str] = Form(default=None),
    state: Optional[str] = Form(default=None),
    error: Optional[str] = Form(default=None),
    user: Optional[str] = Form(default=None),  # JSON, uniquement au 1er login
    session: Session = Depends(get_session),
):
    """Apple envoie un form POST → on retourne une page HTML qui redirige vers le SPA."""

    def _html(fragment: str) -> HTMLResponse:
        return HTMLResponse(
            f"""<!DOCTYPE html><html><head><title>Connexion…</title></head>
<body><script>window.location.replace("{fragment}");</script>
<p>Redirection en cours…</p></body></html>"""
        )

    if error or not code or not state:
        return _html("/#/login?oauth_error=cancelled")

    state_data = _pop_state(state)
    if not state_data:
        return _html("/#/login?oauth_error=invalid_state")

    redirect_uri = state_data["redirect_uri"]
    invite_code = state_data.get("invite_code")

    # Nom (disponible seulement au premier login Apple)
    user_info: dict = {}
    if user:
        try:
            user_info = json.loads(user)
        except Exception:
            pass

    try:
        client_secret = _apple_client_secret()
        with httpx.Client(timeout=10) as client:
            tok = client.post(_APPLE_TOKEN, data={
                "client_id": settings.apple_client_id,
                "client_secret": client_secret,
                "code": code,
                "grant_type": "authorization_code",
                "redirect_uri": redirect_uri,
            })
            tok.raise_for_status()
            tokens = tok.json()
    except Exception as exc:
        logger.error("apple_callback token exchange: %s", exc)
        return _html("/#/login?oauth_error=apple_error")

    # Décoder l'id_token pour récupérer sub + email
    # (la réponse vient directement d'Apple via HTTPS serveur→serveur — pas besoin de vérifier la signature)
    try:
        from jose import jwt as jose_jwt
        payload = jose_jwt.decode(
            tokens.get("id_token", ""),
            options={"verify_signature": False},
        )
        sub = payload.get("sub", "")
        email = (payload.get("email") or "").lower().strip()
    except Exception as exc:
        logger.error("apple_callback id_token decode: %s", exc)
        return _html("/#/login?oauth_error=apple_token_error")

    first = (user_info.get("name") or {}).get("firstName", "")
    last = (user_info.get("name") or {}).get("lastName", "")
    name = f"{first} {last}".strip() or email.split("@")[0] or "Membre"

    if not sub or not email:
        return _html("/#/login?oauth_error=no_email")

    household = session.exec(select(Household)).first()
    if not household:
        return _html("/#/login?oauth_error=no_household")

    member, err = _find_or_create(session, household, email, name, "apple", sub, invite_code)
    if err:
        return _html(f"/#/login?oauth_error={err}")

    return _html(_success_redirect(household, member))
