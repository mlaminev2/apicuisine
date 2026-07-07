from datetime import date, datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, func, select

from app.auth import get_current_admin
from app.config import settings as app_config
from app.db import get_session
from app.models import (
    Dish,
    Household,
    IngredientMap,
    Member,
    PlanEntry,
    Settings,
    ShoppingCategory,
    ShoppingList,
)
from app.schemas import MemberPremiumUpdate

router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(get_current_admin)])


def _month_bounds(today: date) -> tuple[date, date]:
    start = today.replace(day=1)
    end = (start.replace(year=start.year + 1, month=1) if start.month == 12
           else start.replace(month=start.month + 1))
    return start, end


@router.get("/stats")
def admin_stats(
    admin: Member = Depends(get_current_admin),
    session: Session = Depends(get_session),
):
    """Tableau de bord plateforme : tous les foyers, tous les utilisateurs."""
    today = datetime.now(timezone.utc).date()
    month_start, month_end = _month_bounds(today)
    this_month = today.strftime("%Y-%m")

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
    imports_month = sum(
        m.import_count for m in members if getattr(m, "import_month", None) == this_month
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
            "imports_this_month": imports_month,
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
                "imports_this_month": (
                    m.import_count if getattr(m, "import_month", None) == this_month else 0
                ),
                "created_at": m.created_at,
                "is_self": m.id == admin.id,
            }
            for m in members
        ],
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
    from sqlmodel import update
    session.exec(update(PlanEntry).where(PlanEntry.planned_by == member_id).values(planned_by=None))
    session.exec(update(PlanEntry).where(PlanEntry.cooked_by == member_id).values(cooked_by=None))
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
    for model in (PlanEntry, ShoppingList, IngredientMap, ShoppingCategory, Dish, Member):
        for row in session.exec(select(model).where(model.household_id == household_id)).all():
            session.delete(row)
    sett = session.get(Settings, household_id)
    if sett:
        session.delete(sett)
    session.delete(household)
    session.commit()


@router.get("/backups")
def admin_backups():
    """Liste les sauvegardes quotidiennes de la base (SQLite uniquement)."""
    url = app_config.database_url
    if not url.startswith("sqlite:///"):
        return {"supported": False, "backups": []}
    db_path = Path(url[len("sqlite:///"):])
    backups_dir = db_path.parent / "backups"
    if not backups_dir.is_dir():
        return {"supported": True, "backups": []}
    items = []
    for f in sorted(backups_dir.glob("menu-*.db"), reverse=True):
        st = f.stat()
        items.append({
            "name": f.name,
            "size": st.st_size,
            "modified_at": datetime.fromtimestamp(st.st_mtime, tz=timezone.utc).isoformat(),
        })
    return {"supported": True, "backups": items}
