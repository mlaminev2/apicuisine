"""Paiements Stripe : abonnement Premium (imports illimités, sans publicité).

On utilise Stripe Checkout et le portail client *hébergés* : l'utilisateur est
redirigé vers les pages sécurisées de Stripe (aucune donnée bancaire ne transite
par notre serveur, et la CSP reste stricte — pas de script Stripe côté front).

L'activation/désactivation du premium se fait exclusivement via les webhooks
Stripe (source de vérité), dont la signature est vérifiée.
"""
import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlmodel import Session, select

from app.config import settings as cfg
from app.db import get_session
from app.models import Member
from app.auth import get_current_member

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["billing"])


def _stripe():
    """Retourne le module stripe configuré, ou lève 400 si le paiement est off."""
    if not cfg.stripe_enabled:
        raise HTTPException(status_code=400, detail="Le paiement n'est pas encore disponible.")
    import stripe
    stripe.api_key = cfg.stripe_secret_key
    return stripe


def _base_url() -> str:
    return cfg.app_base_url.rstrip("/")


def _price_info(stripe, price_id: str) -> dict | None:
    """Montant/périodicité d'un tarif, lu directement dans Stripe (source sûre)."""
    if not price_id:
        return None
    try:
        p = stripe.Price.retrieve(price_id)
        return {
            "price_id": price_id,
            "amount": (p.get("unit_amount") or 0) / 100,
            "currency": (p.get("currency") or "eur").upper(),
            "interval": (p.get("recurring") or {}).get("interval"),  # "month" | "year"
        }
    except Exception:
        logger.exception("Stripe: lecture du tarif %s impossible", price_id)
        return None


@router.get("/billing/config")
def billing_config():
    """Config publique de paiement : le front sait s'il peut proposer l'abonnement
    et affiche les tarifs réels définis dans Stripe."""
    if not cfg.stripe_enabled:
        return {"enabled": False, "monthly": None, "yearly": None}
    stripe = _stripe()
    return {
        "enabled": True,
        "monthly": _price_info(stripe, cfg.stripe_price_monthly),
        "yearly": _price_info(stripe, cfg.stripe_price_yearly),
    }


@router.post("/billing/checkout")
def create_checkout(
    body: dict,
    member: Member = Depends(get_current_member),
    session: Session = Depends(get_session),
):
    """Crée une session de paiement Stripe et renvoie l'URL de redirection."""
    stripe = _stripe()
    plan = (body or {}).get("plan", "monthly")
    price_id = cfg.stripe_price_yearly if plan == "yearly" else cfg.stripe_price_monthly
    if not price_id:
        raise HTTPException(status_code=400, detail="Cette formule n'est pas disponible.")

    params = {
        "mode": "subscription",
        "line_items": [{"price": price_id, "quantity": 1}],
        "success_url": f"{_base_url()}/#/premium?paid=1",
        "cancel_url": f"{_base_url()}/#/premium?canceled=1",
        "client_reference_id": str(member.id),
        "metadata": {"member_id": str(member.id)},
        "allow_promotion_codes": True,
    }
    # Réutilise le client Stripe existant, sinon pré-remplit l'email
    if member.stripe_customer_id:
        params["customer"] = member.stripe_customer_id
    elif member.email:
        params["customer_email"] = member.email

    try:
        checkout = stripe.checkout.Session.create(**params)
    except Exception:
        logger.exception("Stripe: création de la session de paiement impossible (member=%s)", member.id)
        raise HTTPException(status_code=502, detail="Paiement momentanément indisponible, réessayez.")
    return {"url": checkout.url}


@router.post("/billing/portal")
def create_portal(
    member: Member = Depends(get_current_member),
    session: Session = Depends(get_session),
):
    """Ouvre le portail client Stripe (gérer/résilier l'abonnement, factures)."""
    stripe = _stripe()
    if not member.stripe_customer_id:
        raise HTTPException(status_code=400, detail="Aucun abonnement à gérer.")
    try:
        portal = stripe.billing_portal.Session.create(
            customer=member.stripe_customer_id,
            return_url=f"{_base_url()}/#/reglages",
        )
    except Exception:
        logger.exception("Stripe: ouverture du portail impossible (member=%s)", member.id)
        raise HTTPException(status_code=502, detail="Gestion de l'abonnement momentanément indisponible.")
    return {"url": portal.url}


# ── Webhook : source de vérité de l'état d'abonnement ─────────────────────────

def _grant(member: Member, customer: str | None, subscription: str | None, session: Session):
    member.is_premium = True
    member.premium_source = "stripe"
    if customer:
        member.stripe_customer_id = customer
    if subscription:
        member.stripe_subscription_id = subscription
    session.add(member)
    session.commit()
    logger.info("billing: premium accordé member=%s sub=%s", member.id, subscription)


def _revoke_by_customer(customer: str | None, session: Session):
    """Retire le premium — uniquement s'il provient de Stripe (on ne touche pas
    à un premium accordé manuellement par l'administrateur)."""
    if not customer:
        return
    member = session.exec(select(Member).where(Member.stripe_customer_id == customer)).first()
    if member and member.premium_source == "stripe":
        member.is_premium = False
        member.premium_source = None
        member.stripe_subscription_id = None
        session.add(member)
        session.commit()
        logger.info("billing: premium retiré member=%s (abonnement terminé)", member.id)


@router.post("/stripe/webhook")
async def stripe_webhook(request: Request, session: Session = Depends(get_session)):
    if not cfg.stripe_enabled or not cfg.stripe_webhook_secret:
        raise HTTPException(status_code=400, detail="Webhook non configuré.")
    import stripe

    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")
    try:
        event = stripe.Webhook.construct_event(payload, sig, cfg.stripe_webhook_secret)
    except Exception:
        logger.warning("billing: signature de webhook invalide")
        raise HTTPException(status_code=400, detail="Signature invalide")

    etype = event["type"]
    obj = event["data"]["object"]

    if etype == "checkout.session.completed":
        ref = obj.get("client_reference_id") or (obj.get("metadata") or {}).get("member_id")
        member = session.get(Member, int(ref)) if ref else None
        if member:
            _grant(member, obj.get("customer"), obj.get("subscription"), session)

    elif etype == "customer.subscription.updated":
        # Abonnement passé à un état non actif → on retire l'accès
        if obj.get("status") in ("canceled", "unpaid", "incomplete_expired", "past_due"):
            _revoke_by_customer(obj.get("customer"), session)
        elif obj.get("status") in ("active", "trialing"):
            member = session.exec(
                select(Member).where(Member.stripe_customer_id == obj.get("customer"))
            ).first()
            if member:
                _grant(member, obj.get("customer"), obj.get("id"), session)

    elif etype == "customer.subscription.deleted":
        _revoke_by_customer(obj.get("customer"), session)

    return {"received": True}
