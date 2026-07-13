"""Envoi de notifications push web (protocole Web Push + VAPID)."""
import json
import logging

from app.config import settings

logger = logging.getLogger(__name__)


def push_configured() -> bool:
    return settings.push_enabled


def send_push(subscription: dict, title: str, body: str, url: str = "/") -> str:
    """Envoie une notification à un abonnement.

    Retourne :
      - "ok"      : notification acceptée par le service push
      - "gone"    : abonnement expiré/invalide (404/410) → à supprimer en base
      - "error"   : autre échec (réseau, config…)
    """
    if not push_configured():
        logger.warning("Push non configuré — notification non envoyée")
        return "error"
    try:
        from pywebpush import webpush, WebPushException
    except ImportError:
        logger.error("pywebpush non installé")
        return "error"

    payload = json.dumps({"title": title, "body": body, "url": url})
    try:
        webpush(
            subscription_info=subscription,
            data=payload,
            vapid_private_key=settings.vapid_private_pem,
            vapid_claims={"sub": settings.vapid_subject},
            timeout=10,
        )
        return "ok"
    except WebPushException as exc:
        status = getattr(exc.response, "status_code", None)
        if status in (404, 410):
            return "gone"
        logger.error("Push échec (status=%s) : %s", status, exc)
        return "error"
    except Exception as exc:  # noqa: BLE001
        logger.error("Push erreur inattendue : %s", exc)
        return "error"
