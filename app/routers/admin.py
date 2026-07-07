from datetime import date, datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends
from sqlmodel import Session, func, select

from app.auth import get_current_owner
from app.config import settings as app_config
from app.db import get_session
from app.models import Dish, Member, PlanEntry, Settings, ShoppingList

router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(get_current_owner)])


def _month_bounds(today: date) -> tuple[date, date]:
    start = today.replace(day=1)
    end = (start.replace(year=start.year + 1, month=1) if start.month == 12
           else start.replace(month=start.month + 1))
    return start, end


@router.get("/stats")
def admin_stats(
    owner: Member = Depends(get_current_owner),
    session: Session = Depends(get_session),
):
    """Tableau de bord du propriétaire : usage du foyer et des membres."""
    hid = owner.household_id
    today = datetime.now(timezone.utc).date()
    month_start, month_end = _month_bounds(today)
    this_month = today.strftime("%Y-%m")

    members = session.exec(select(Member).where(Member.household_id == hid)).all()
    dishes_total = session.exec(select(func.count()).select_from(Dish).where(Dish.household_id == hid)).one()
    dishes_active = session.exec(
        select(func.count()).select_from(Dish).where(Dish.household_id == hid, Dish.active == True)  # noqa: E712
    ).one()
    dishes_with_recipe = session.exec(
        select(func.count()).select_from(Dish).where(Dish.household_id == hid, Dish.ingredients != "[]")
    ).one()
    planned_month = session.exec(
        select(func.count()).select_from(PlanEntry).where(
            PlanEntry.household_id == hid,
            PlanEntry.date >= month_start, PlanEntry.date < month_end,
        )
    ).one()
    cooked_month = session.exec(
        select(func.count()).select_from(PlanEntry).where(
            PlanEntry.household_id == hid,
            PlanEntry.date >= month_start, PlanEntry.date < month_end,
            PlanEntry.cooked == True,  # noqa: E712
        )
    ).one()
    cooked_total = session.exec(
        select(func.count()).select_from(PlanEntry).where(
            PlanEntry.household_id == hid, PlanEntry.cooked == True  # noqa: E712
        )
    ).one()
    shopping_lists = session.exec(
        select(func.count()).select_from(ShoppingList).where(ShoppingList.household_id == hid)
    ).one()

    sett = session.get(Settings, hid)

    return {
        "counts": {
            "members": len(members),
            "dishes_total": dishes_total,
            "dishes_active": dishes_active,
            "dishes_with_recipe": dishes_with_recipe,
            "planned_this_month": planned_month,
            "cooked_this_month": cooked_month,
            "cooked_total": cooked_total,
            "shopping_lists": shopping_lists,
        },
        "freemium": {
            "enabled": getattr(sett, "freemium_enabled", False) if sett else False,
            "import_limit": app_config.import_free_limit,
        },
        "members": [
            {
                "id": m.id,
                "name": m.name,
                "email": m.email,
                "color": m.color,
                "is_owner": m.is_owner,
                "is_premium": getattr(m, "is_premium", False),
                "imports_this_month": (
                    m.import_count if getattr(m, "import_month", None) == this_month else 0
                ),
                "created_at": m.created_at,
            }
            for m in members
        ],
    }


@router.get("/backups")
def admin_backups(owner: Member = Depends(get_current_owner)):
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
