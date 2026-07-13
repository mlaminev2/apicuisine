from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, delete, select

from app.auth import get_current_member
from app.config import settings as app_config
from app.db import get_session
from app.models import Member, PushSubscription
from app.schemas import PushSubscribeRequest
from app.services.push import send_push

router = APIRouter(prefix="/api/push", tags=["push"])


@router.get("/config")
def push_config():
    """Clé publique VAPID pour l'abonnement côté navigateur (sans authentification)."""
    return {
        "enabled": app_config.push_enabled,
        "public_key": app_config.vapid_public_key or "",
    }


@router.post("/subscribe", status_code=204)
def subscribe(
    body: PushSubscribeRequest,
    member: Member = Depends(get_current_member),
    session: Session = Depends(get_session),
):
    """Enregistre (ou met à jour) l'abonnement de cet appareil et active les rappels."""
    if not app_config.push_enabled:
        raise HTTPException(status_code=503, detail="Notifications non disponibles")
    existing = session.exec(
        select(PushSubscription).where(PushSubscription.endpoint == body.endpoint)
    ).first()
    if existing:
        existing.member_id = member.id
        existing.household_id = member.household_id
        existing.p256dh = body.keys.p256dh
        existing.auth = body.keys.auth
        session.add(existing)
    else:
        session.add(PushSubscription(
            member_id=member.id,
            household_id=member.household_id,
            endpoint=body.endpoint,
            p256dh=body.keys.p256dh,
            auth=body.keys.auth,
        ))
    member.reminder_enabled = True
    session.add(member)
    session.commit()


@router.post("/unsubscribe", status_code=204)
def unsubscribe(
    member: Member = Depends(get_current_member),
    session: Session = Depends(get_session),
):
    """Désactive les rappels et supprime les abonnements de ce membre."""
    session.exec(delete(PushSubscription).where(PushSubscription.member_id == member.id))
    member.reminder_enabled = False
    session.add(member)
    session.commit()


@router.post("/test", status_code=204)
def test_push(
    member: Member = Depends(get_current_member),
    session: Session = Depends(get_session),
):
    """Envoie une notification de test au membre courant (feedback immédiat à l'activation)."""
    subs = session.exec(
        select(PushSubscription).where(PushSubscription.member_id == member.id)
    ).all()
    if not subs:
        raise HTTPException(status_code=404, detail="Aucun appareil abonné")
    sent = 0
    for sub in subs:
        result = send_push(
            {"endpoint": sub.endpoint, "keys": {"p256dh": sub.p256dh, "auth": sub.auth}},
            "Menu en Famille",
            "Notifications activées ✓ Vous recevrez le rappel du dîner chaque jour.",
            "/#/calendrier",
        )
        if result == "gone":
            session.delete(sub)
        elif result == "ok":
            sent += 1
    session.commit()
    if sent == 0:
        raise HTTPException(status_code=502, detail="Envoi impossible")
