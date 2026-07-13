import logging
import re
import sqlite3
import time
from datetime import date, datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlmodel import Session, func, select

from app.auth import get_current_admin, member_has_premium
from app.config import settings as app_config
from app.db import get_session
from app.models import (
    Dish,
    Household,
    IngredientMap,
    Member,
    PlanEntry,
    PushSubscription,
    Settings,
    ShoppingCategory,
    ShoppingList,
)
from app.schemas import MemberPremiumUpdate

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(get_current_admin)])


def _month_bounds(today: date) -> tuple[date, date]:
    start = today.replace(day=1)
    end = (start.replace(year=start.year + 1, month=1) if start.month == 12
           else start.replace(month=start.month + 1))
    return start, end


def _billing_overview(members: list[Member]) -> dict:
    """Récapitulatif abonnements : abonnés payants + revenu mensuel réel (lu dans
    Stripe si disponible), et premium offerts (accordés à la main)."""
    def _src(m):
        return getattr(m, "premium_source", None)
    subscribers_db = sum(1 for m in members if _src(m) == "stripe")
    granted = sum(1 for m in members if getattr(m, "is_premium", False) and _src(m) != "stripe")

    out = {
        "stripe_enabled": app_config.stripe_enabled,
        "mode": None,
        "subscribers": subscribers_db,
        "mrr": None,          # revenu mensuel récurrent (€), None si indisponible
        "granted": granted,
    }
    if not app_config.stripe_enabled:
        return out
    out["mode"] = "test" if app_config.stripe_secret_key.startswith("sk_test") else "live"
    snap = _stripe_snapshot()
    if snap is not None:
        out["subscribers"], out["mrr"] = snap
    return out


_STRIPE_CACHE: dict = {"ts": 0.0, "data": None}
_STRIPE_CACHE_TTL = 90  # secondes


def _stripe_snapshot():
    """(abonnés actifs, MRR €) lu dans Stripe, mis en cache pour éviter un appel
    réseau à chaque ouverture de l'admin. Retourne None si Stripe est injoignable."""
    now = time.time()
    if _STRIPE_CACHE["data"] is not None and now - _STRIPE_CACHE["ts"] < _STRIPE_CACHE_TTL:
        return _STRIPE_CACHE["data"]
    try:
        import stripe
        stripe.api_key = app_config.stripe_secret_key
        n, mrr = 0, 0.0
        subs = stripe.Subscription.list(status="active", limit=100)
        for s in subs.auto_paging_iter():
            price = s["items"]["data"][0]["price"]
            amount = (price.get("unit_amount") or 0) / 100
            interval = (price.get("recurring") or {}).get("interval")
            mrr += amount / 12 if interval == "year" else amount
            n += 1
        data = (n, round(mrr, 2))
        _STRIPE_CACHE.update(ts=now, data=data)
        return data
    except Exception:
        logger.exception("admin: récapitulatif Stripe indisponible")
        return None


def _system_overview() -> dict:
    """État de configuration des intégrations (pour l'admin)."""
    stripe_mode = None
    if app_config.stripe_enabled:
        stripe_mode = "test" if app_config.stripe_secret_key.startswith("sk_test") else "live"
    return {
        "stripe": stripe_mode,  # "test" | "live" | None
        "adsense": bool(app_config.adsense_client_id),
        "analytics": bool(app_config.ga_measurement_id or app_config.gtm_container_id),
        "pixel": bool(app_config.meta_pixel_id),
    }


@router.get("/stats")
def admin_stats(
    admin: Member = Depends(get_current_admin),
    session: Session = Depends(get_session),
):
    """Tableau de bord plateforme : tous les foyers, tous les utilisateurs."""
    today = datetime.now(timezone.utc).date()
    month_start, month_end = _month_bounds(today)
    this_week = today.strftime("%G-W%V")  # semaine ISO (le quota d'imports est hebdomadaire)

    households = session.exec(select(Household).order_by(Household.id)).all()
    members = session.exec(select(Member).order_by(Member.household_id, Member.id)).all()

    def _count(model, *where):
        return session.exec(select(func.count()).select_from(model).where(*where)).one() if where \
            else session.exec(select(func.count()).select_from(model)).one()

    dishes_total = _count(Dish)
    planned_month = _count(PlanEntry, PlanEntry.date >= month_start, PlanEntry.date < month_end)
    cooked_month = _count(
        PlanEntry, PlanEntry.date >= month_start, PlanEntry.date < month_end,
        PlanEntry.cooked == True,  # noqa: E712
    )
    imports_week = sum(
        m.import_count for m in members if getattr(m, "import_month", None) == this_week
    )
    new_members_month = sum(1 for m in members if m.created_at and m.created_at.date() >= month_start)

    # Détail par foyer
    dishes_by_hh = dict(session.exec(
        select(Dish.household_id, func.count()).group_by(Dish.household_id)
    ).all())
    planned_by_hh = dict(session.exec(
        select(PlanEntry.household_id, func.count())
        .where(PlanEntry.date >= month_start, PlanEntry.date < month_end)
        .group_by(PlanEntry.household_id)
    ).all())
    members_by_hh: dict[int, int] = {}
    for m in members:
        members_by_hh[m.household_id] = members_by_hh.get(m.household_id, 0) + 1
    settings_by_hh = {s.household_id: s for s in session.exec(select(Settings)).all()}
    hh_names = {h.id: h.name for h in households}

    return {
        "platform": {
            "households": len(households),
            "members": len(members),
            "new_members_this_month": new_members_month,
            "dishes_total": dishes_total,
            "planned_this_month": planned_month,
            "cooked_this_month": cooked_month,
            "imports_this_week": imports_week,
            "import_limit": app_config.import_free_limit,
        },
        "households": [
            {
                "id": h.id,
                "name": h.name,
                "members": members_by_hh.get(h.id, 0),
                "dishes": dishes_by_hh.get(h.id, 0),
                "planned_this_month": planned_by_hh.get(h.id, 0),
                "freemium_enabled": getattr(settings_by_hh.get(h.id), "freemium_enabled", False),
                "created_at": h.created_at,
                "is_admin_household": h.id == admin.household_id,
            }
            for h in households
        ],
        "members": [
            {
                "id": m.id,
                "name": m.name,
                "email": m.email,
                "color": m.color,
                "household_id": m.household_id,
                "household_name": hh_names.get(m.household_id, "?"),
                "is_owner": m.is_owner,
                "is_premium": getattr(m, "is_premium", False),
                "premium_source": getattr(m, "premium_source", None),
                "premium_active": member_has_premium(m, session),
                "imports_this_week": (
                    m.import_count if getattr(m, "import_month", None) == this_week else 0
                ),
                "created_at": m.created_at,
                "is_self": m.id == admin.id,
            }
            for m in members
        ],
        "billing": _billing_overview(members),
        "system": _system_overview(),
    }


@router.put("/freemium")
def admin_set_freemium(
    body: dict,
    session: Session = Depends(get_session),
):
    """Active/désactive le freemium sur TOUTE la plateforme (tous les foyers)."""
    enabled = bool(body.get("enabled"))
    households = session.exec(select(Household)).all()
    for h in households:
        sett = session.get(Settings, h.id)
        if not sett:
            sett = Settings(household_id=h.id)
        sett.freemium_enabled = enabled
        sett.updated_at = datetime.now(timezone.utc)
        session.add(sett)
    session.commit()
    return {"enabled": enabled, "households_updated": len(households)}


@router.put("/members/{member_id}/premium")
def admin_set_premium(
    member_id: int,
    body: MemberPremiumUpdate,
    session: Session = Depends(get_session),
):
    """Accorde/retire le premium à n'importe quel utilisateur de la plateforme."""
    target = session.get(Member, member_id)
    if not target:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    target.is_premium = body.is_premium
    target.premium_source = "admin" if body.is_premium else None
    session.add(target)
    session.commit()
    return {"id": target.id, "is_premium": target.is_premium}


@router.delete("/members/{member_id}", status_code=204)
def admin_delete_member(
    member_id: int,
    admin: Member = Depends(get_current_admin),
    session: Session = Depends(get_session),
):
    """Supprime un utilisateur (n'importe quel foyer)."""
    if member_id == admin.id:
        raise HTTPException(status_code=400, detail="Impossible de supprimer votre propre compte")
    target = session.get(Member, member_id)
    if not target:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    from sqlmodel import delete, update
    session.exec(update(PlanEntry).where(PlanEntry.planned_by == member_id).values(planned_by=None))
    session.exec(update(PlanEntry).where(PlanEntry.cooked_by == member_id).values(cooked_by=None))
    session.exec(delete(PushSubscription).where(PushSubscription.member_id == member_id))
    session.delete(target)
    session.commit()


@router.delete("/households/{household_id}", status_code=204)
def admin_delete_household(
    household_id: int,
    admin: Member = Depends(get_current_admin),
    session: Session = Depends(get_session),
):
    """Supprime un foyer et TOUTES ses données (irréversible)."""
    if household_id == admin.household_id:
        raise HTTPException(status_code=400, detail="Impossible de supprimer votre propre foyer")
    household = session.get(Household, household_id)
    if not household:
        raise HTTPException(status_code=404, detail="Foyer introuvable")
    for model in (PlanEntry, ShoppingList, IngredientMap, ShoppingCategory, Dish, PushSubscription, Member):
        for row in session.exec(select(model).where(model.household_id == household_id)).all():
            session.delete(row)
    sett = session.get(Settings, household_id)
    if sett:
        session.delete(sett)
    session.delete(household)
    session.commit()


def _sqlite_paths() -> tuple[Path | None, Path | None]:
    """(chemin de la base, dossier des sauvegardes) si SQLite, sinon (None, None)."""
    url = app_config.database_url
    if not url.startswith("sqlite:///"):
        return None, None
    db_path = Path(url[len("sqlite:///"):])
    return db_path, db_path.parent / "backups"


def _backup_info(f: Path) -> dict:
    st = f.stat()
    return {
        "name": f.name,
        "size": st.st_size,
        "modified_at": datetime.fromtimestamp(st.st_mtime, tz=timezone.utc).isoformat(),
    }


# Nom de sauvegarde autorisé (anti-traversée de répertoire)
_BACKUP_NAME_RE = re.compile(r"^menu-[0-9A-Za-z_.\-]+\.db$")


@router.get("/backups")
def admin_backups():
    """Liste les sauvegardes de la base (SQLite uniquement)."""
    db_path, backups_dir = _sqlite_paths()
    if not backups_dir:
        return {"supported": False, "backups": []}
    if not backups_dir.is_dir():
        return {"supported": True, "backups": []}
    items = [_backup_info(f) for f in sorted(backups_dir.glob("menu-*.db"), reverse=True)]
    return {"supported": True, "backups": items}


@router.post("/backups")
def admin_create_backup():
    """Déclenche une sauvegarde immédiate (copie cohérente via l'API SQLite)."""
    db_path, backups_dir = _sqlite_paths()
    if not backups_dir or not db_path:
        raise HTTPException(status_code=400, detail="Sauvegarde manuelle indisponible (base non SQLite)")
    backups_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    dest = backups_dir / f"menu-{ts}.db"
    src = sqlite3.connect(str(db_path))
    dst = sqlite3.connect(str(dest))
    try:
        src.backup(dst)  # API de sauvegarde en ligne : cohérente même avec le WAL
    finally:
        dst.close()
        src.close()
    logger.info("admin: sauvegarde manuelle créée (%s)", dest.name)
    return {"supported": True, "created": _backup_info(dest)}


@router.get("/backups/download")
def admin_download_backup(name: str):
    """Télécharge une sauvegarde précise (nom validé, confiné au dossier des sauvegardes)."""
    db_path, backups_dir = _sqlite_paths()
    if not backups_dir:
        raise HTTPException(status_code=400, detail="Sauvegardes indisponibles")
    if not _BACKUP_NAME_RE.match(name):
        raise HTTPException(status_code=400, detail="Nom de sauvegarde invalide")
    target = (backups_dir / name).resolve()
    if not target.is_relative_to(backups_dir.resolve()) or not target.is_file():
        raise HTTPException(status_code=404, detail="Sauvegarde introuvable")
    return FileResponse(str(target), media_type="application/octet-stream", filename=name)
