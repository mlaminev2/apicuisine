from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from app.db import get_session
from app.models import Household, ShoppingCategory, IngredientMap
from app.auth import get_current_household
from app.schemas import (
    ShoppingCategoryRead, ShoppingCategoryCreate, ShoppingCategoryUpdate,
    IngredientMapEntry,
)
from app.services.autocategorize import guess_type_key

router = APIRouter(prefix="/api", tags=["categories"])

DEFAULT_SHOP_CATEGORIES = [
    {"type_key": "viande",       "name": "🥩 Viande & Volaille",        "color": "#C0504D", "sort_order": 0},
    {"type_key": "poisson",      "name": "🐟 Poisson & Fruits de mer",   "color": "#4B8FA6", "sort_order": 1},
    {"type_key": "laitiers",     "name": "🥛 Laitiers & Œufs",           "color": "#F0C040", "sort_order": 2},
    {"type_key": "legumes",      "name": "🥦 Fruits & Légumes frais",    "color": "#6A8D73", "sort_order": 3},
    {"type_key": "fruits",       "name": "🍎 Fruits",                    "color": "#E57A44", "sort_order": 4},
    {"type_key": "halal",        "name": "🌍 Épicerie Halal / Monde",    "color": "#B5651D", "sort_order": 5},
    {"type_key": "surgeles",     "name": "❄️ Surgelés",                  "color": "#74B9E0", "sort_order": 6},
    {"type_key": "epicerie",     "name": "🥫 Épicerie & Conserves",      "color": "#8C6A4A", "sort_order": 7},
    {"type_key": "boulangerie",  "name": "🍞 Boulangerie",               "color": "#D9A93C", "sort_order": 8},
    {"type_key": "hygiene",      "name": "🧴 Hygiène & Maison",          "color": "#9B59B6", "sort_order": 9},
    {"type_key": "autres",       "name": "📦 Autres",                    "color": "#888888", "sort_order": 99},
]


def _seed_categories(household_id: int, session: Session) -> list[ShoppingCategory]:
    cats = []
    for d in DEFAULT_SHOP_CATEGORIES:
        c = ShoppingCategory(household_id=household_id, **d)
        session.add(c)
        cats.append(c)
    session.commit()
    for c in cats:
        session.refresh(c)
    return cats


def get_or_seed_categories(household_id: int, session: Session) -> list[ShoppingCategory]:
    cats = session.exec(
        select(ShoppingCategory)
        .where(ShoppingCategory.household_id == household_id)
        .order_by(ShoppingCategory.sort_order)
    ).all()
    if not cats:
        cats = _seed_categories(household_id, session)
    return list(cats)


def resolve_category_id(text: str, household_id: int, session: Session) -> Optional[int]:
    """Return category_id for an ingredient text; auto-seeds categories if needed."""
    # Strip quantity suffix: "poulet — 500g" → use "poulet" as the stable key
    name_part = text.split(" — ")[0].strip() if " — " in text else text
    key = name_part.lower().strip()
    mapping = session.exec(
        select(IngredientMap).where(
            IngredientMap.household_id == household_id,
            IngredientMap.ingredient_key == key,
        )
    ).first()
    if mapping:
        return mapping.category_id

    cats = get_or_seed_categories(household_id, session)
    type_key = guess_type_key(text)
    matched = next((c for c in cats if c.type_key == type_key), None)
    if not matched:
        matched = next((c for c in cats if c.type_key == "autres"), None)
    category_id = matched.id if matched else None

    entry = IngredientMap(household_id=household_id, ingredient_key=key, category_id=category_id)
    session.add(entry)
    session.commit()
    return category_id


# ── Categories CRUD ───────────────────────────────────────────────────────────

@router.get("/shopping-categories", response_model=list[ShoppingCategoryRead])
def list_categories(
    household: Household = Depends(get_current_household),
    session: Session = Depends(get_session),
):
    return get_or_seed_categories(household.id, session)


@router.post("/shopping-categories", response_model=ShoppingCategoryRead, status_code=201)
def create_category(
    body: ShoppingCategoryCreate,
    household: Household = Depends(get_current_household),
    session: Session = Depends(get_session),
):
    existing = session.exec(
        select(ShoppingCategory).where(ShoppingCategory.household_id == household.id)
        .order_by(ShoppingCategory.sort_order.desc())
    ).first()
    sort_order = (existing.sort_order + 1) if existing and existing.sort_order < 99 else 98
    cat = ShoppingCategory(
        household_id=household.id,
        name=body.name,
        color=body.color,
        sort_order=sort_order,
    )
    session.add(cat)
    session.commit()
    session.refresh(cat)
    return cat


@router.put("/shopping-categories/{cat_id}", response_model=ShoppingCategoryRead)
def update_category(
    cat_id: int,
    body: ShoppingCategoryUpdate,
    household: Household = Depends(get_current_household),
    session: Session = Depends(get_session),
):
    cat = session.get(ShoppingCategory, cat_id)
    if not cat or cat.household_id != household.id:
        raise HTTPException(status_code=404, detail="Catégorie introuvable")
    if body.name is not None:
        cat.name = body.name
    if body.color is not None:
        cat.color = body.color
    if body.sort_order is not None:
        cat.sort_order = body.sort_order
    session.add(cat)
    session.commit()
    session.refresh(cat)
    return cat


@router.delete("/shopping-categories/{cat_id}")
def delete_category(
    cat_id: int,
    household: Household = Depends(get_current_household),
    session: Session = Depends(get_session),
):
    cat = session.get(ShoppingCategory, cat_id)
    if not cat or cat.household_id != household.id:
        raise HTTPException(status_code=404, detail="Catégorie introuvable")
    cats = get_or_seed_categories(household.id, session)
    autres = next((c for c in cats if c.type_key == "autres" and c.id != cat_id), None)
    fallback_id = autres.id if autres else None
    maps = session.exec(
        select(IngredientMap).where(
            IngredientMap.household_id == household.id,
            IngredientMap.category_id == cat_id,
        )
    ).all()
    for m in maps:
        m.category_id = fallback_id
        session.add(m)
    session.delete(cat)
    session.commit()
    return {"ok": True}


# ── Ingredient map ────────────────────────────────────────────────────────────

@router.get("/ingredient-map", response_model=list[IngredientMapEntry])
def list_ingredient_map(
    household: Household = Depends(get_current_household),
    session: Session = Depends(get_session),
):
    entries = session.exec(
        select(IngredientMap)
        .where(IngredientMap.household_id == household.id)
        .order_by(IngredientMap.ingredient_key)
    ).all()
    return [IngredientMapEntry(ingredient_key=e.ingredient_key, category_id=e.category_id) for e in entries]


@router.delete("/ingredient-map")
def delete_ingredient_map(
    key: str,
    household: Household = Depends(get_current_household),
    session: Session = Depends(get_session),
):
    norm = key.lower().strip()
    entry = session.exec(
        select(IngredientMap).where(
            IngredientMap.household_id == household.id,
            IngredientMap.ingredient_key == norm,
        )
    ).first()
    if entry:
        session.delete(entry)
        session.commit()
    return {"ok": True}


@router.put("/ingredient-map")
def upsert_ingredient_map(
    body: IngredientMapEntry,
    household: Household = Depends(get_current_household),
    session: Session = Depends(get_session),
):
    key = body.ingredient_key.lower().strip()
    entry = session.exec(
        select(IngredientMap).where(
            IngredientMap.household_id == household.id,
            IngredientMap.ingredient_key == key,
        )
    ).first()
    if entry:
        entry.category_id = body.category_id
    else:
        entry = IngredientMap(household_id=household.id, ingredient_key=key, category_id=body.category_id)
    session.add(entry)
    session.commit()
    return {"ok": True}
