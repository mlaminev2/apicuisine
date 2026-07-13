"""Envoi quotidien du rappel du dîner par notification push.

Lancé par cron sur le serveur, ex. à 17h :
    docker compose exec -T app python -m app.send_reminders
"""
import logging
from datetime import date

from sqlmodel import Session, select

from app.config import settings
from app.db import engine
from app.models import Dish, Member, PlanEntry, PushSubscription
from app.services.push import send_push

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("reminders")


def _dinner_label(session: Session, household_id: int, day: date) -> str | None:
    """Nom du plat principal du soir prévu ce jour, ou texte libre, sinon None."""
    entry = session.exec(
        select(PlanEntry).where(
            PlanEntry.household_id == household_id, PlanEntry.date == day
        )
    ).first()
    if not entry:
        return None
    if entry.main_dish_id:
        dish = session.get(Dish, entry.main_dish_id)
        if dish:
            return dish.name
    if entry.free_text:
        return entry.free_text.strip() or None
    return None


def run() -> None:
    if not settings.push_enabled:
        logger.warning("Push non configuré — aucun rappel envoyé")
        return
    today = date.today()
    sent = removed = 0
    with Session(engine) as session:
        subs = session.exec(select(PushSubscription)).all()
        for sub in subs:
            member = session.get(Member, sub.member_id)
            if not member or not getattr(member, "reminder_enabled", False):
                continue
            dish = _dinner_label(session, sub.household_id, today)
            if dish:
                title = f"Ce soir : {dish} 🍽️"
                body = "Bon appétit ! Touchez pour voir la recette."
            else:
                title = "Qu'est-ce qu'on mange ce soir ?"
                body = "Aucun plat prévu — touchez pour planifier votre dîner."
            result = send_push(
                {"endpoint": sub.endpoint, "keys": {"p256dh": sub.p256dh, "auth": sub.auth}},
                title, body, "/#/calendrier",
            )
            if result == "gone":
                session.delete(sub)
                removed += 1
            elif result == "ok":
                sent += 1
        session.commit()
    logger.info("Rappels envoyés : %d, abonnements expirés supprimés : %d", sent, removed)


if __name__ == "__main__":
    run()
