import json
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlmodel import Session, select, col
from app.db import get_session
from app.models import Household, Dish
from app.auth import get_current_household
from app.schemas import DishCreate, DishUpdate, DishRead

router = APIRouter(prefix="/api", tags=["dishes"])

VALID_CATEGORIES = frozenset({
    "pomme_de_terre", "riz", "pates", "entree", "autre", "sucree", "africain", "apero", "sauce",
})
MAX_UPLOAD_BYTES = 5 * 1024 * 1024  # 5 Mo
ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
ALLOWED_IMAGE_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}


def _assert_valid_category(category: str) -> None:
    if category not in VALID_CATEGORIES:
        raise HTTPException(status_code=422, detail="Catégorie invalide")


@router.get("/dishes", response_model=list[DishRead])
def list_dishes(
    category: Optional[str] = None,
    active: Optional[bool] = None,
    q: Optional[str] = Query(default=None, max_length=100, description="Recherche par nom"),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=500, ge=1, le=500),
    household: Household = Depends(get_current_household),
    session: Session = Depends(get_session),
):
    stmt = select(Dish).where(Dish.household_id == household.id)
    if category:
        stmt = stmt.where(Dish.category == category)
    if active is not None:
        stmt = stmt.where(Dish.active == active)
    if q:
        stmt = stmt.where(col(Dish.name).ilike(f"%{q}%"))
    stmt = stmt.order_by(Dish.seed_order, Dish.name).offset(skip).limit(limit)
    return session.exec(stmt).all()


@router.post("/dishes", response_model=DishRead, status_code=201)
def create_dish(
    body: DishCreate,
    household: Household = Depends(get_current_household),
    session: Session = Depends(get_session),
):
    _assert_valid_category(body.category)
    dish = Dish(household_id=household.id, name=body.name, category=body.category)
    session.add(dish)
    session.commit()
    session.refresh(dish)
    return dish


@router.put("/dishes/{dish_id}", response_model=DishRead)
def update_dish(
    dish_id: int,
    body: DishUpdate,
    household: Household = Depends(get_current_household),
    session: Session = Depends(get_session),
):
    dish = session.get(Dish, dish_id)
    if not dish or dish.household_id != household.id:
        raise HTTPException(status_code=404, detail="Plat introuvable")
    if body.name is not None:
        dish.name = body.name
    if body.category is not None:
        _assert_valid_category(body.category)
        dish.category = body.category
    if body.active is not None:
        dish.active = body.active
    if body.ingredients is not None:
        dish.ingredients = json.dumps(body.ingredients, ensure_ascii=False)
    if body.instructions is not None:
        dish.instructions = json.dumps(body.instructions, ensure_ascii=False)
    if body.thumbnail_url is not None:
        dish.thumbnail_url = body.thumbnail_url
    if body.author is not None:
        dish.author = body.author
    if body.is_favorite is not None:
        dish.is_favorite = body.is_favorite
    if body.diet_tags is not None:
        dish.diet_tags = body.diet_tags or None
    session.add(dish)
    session.commit()
    session.refresh(dish)
    return dish


@router.post("/dishes/{dish_id}/image")
async def upload_dish_image(
    dish_id: int,
    file: UploadFile = File(...),
    household: Household = Depends(get_current_household),
    session: Session = Depends(get_session),
):
    dish = session.get(Dish, dish_id)
    if not dish or dish.household_id != household.id:
        raise HTTPException(status_code=404, detail="Plat introuvable")

    if file.content_type not in ALLOWED_IMAGE_CONTENT_TYPES:
        raise HTTPException(status_code=415, detail="Format d'image non supporté")

    ext = Path(file.filename).suffix.lower() if file.filename else ".jpg"
    if ext not in ALLOWED_IMAGE_EXTENSIONS:
        raise HTTPException(status_code=415, detail="Format d'image non supporté")

    content = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Image trop volumineuse (max 5 Mo)")

    uploads_dir = Path(__file__).parent.parent.parent / "web" / "uploads"
    uploads_dir.mkdir(exist_ok=True)

    filename = f"dish_{dish_id}{ext}"
    with open(uploads_dir / filename, "wb") as f:
        f.write(content)

    dish.thumbnail_url = f"/uploads/{filename}"
    session.add(dish)
    session.commit()
    return {"thumbnail_url": dish.thumbnail_url}


@router.delete("/dishes/{dish_id}")
def delete_dish(
    dish_id: int,
    household: Household = Depends(get_current_household),
    session: Session = Depends(get_session),
):
    dish = session.get(Dish, dish_id)
    if not dish or dish.household_id != household.id:
        raise HTTPException(status_code=404, detail="Plat introuvable")
    dish.active = False
    session.add(dish)
    session.commit()
    return {"ok": True}
