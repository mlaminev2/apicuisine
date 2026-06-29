import json as _json
from datetime import datetime, date
from typing import Optional
from pydantic import BaseModel, field_validator


class LoginRequest(BaseModel):
    passcode: str
    member_id: Optional[int] = None


class LoginResponse(BaseModel):
    token: str
    household_id: int
    household_name: str
    member_id: Optional[int] = None


class MemberCreate(BaseModel):
    name: str
    color: str = "#4B8FA6"


class MemberRead(BaseModel):
    id: int
    name: str
    color: str
    created_at: datetime


class DishCreate(BaseModel):
    name: str
    category: str


class DishUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    active: Optional[bool] = None
    ingredients: Optional[list[str]] = None
    instructions: Optional[list[str]] = None
    thumbnail_url: Optional[str] = None
    author: Optional[str] = None


class DishRead(BaseModel):
    id: int
    name: str
    category: str
    source_tag: Optional[str]
    seed_order: int
    active: bool
    created_at: datetime
    ingredients: list[str] = []
    instructions: list[str] = []
    source_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    author: Optional[str] = None

    @field_validator("ingredients", "instructions", mode="before")
    @classmethod
    def _parse_json(cls, v):
        if isinstance(v, str):
            try:
                return _json.loads(v)
            except Exception:
                return []
        return v if v is not None else []


class PriorityDishRead(BaseModel):
    dish: DishRead
    cook_count: int
    never_cooked: bool


class PlanEntryUpdate(BaseModel):
    main_dish_id: Optional[int] = None
    dessert_dish_id: Optional[int] = None
    entree_dish_id: Optional[int] = None
    free_text: Optional[str] = None
    planned_by: Optional[int] = None


class PlanEntryPatch(BaseModel):
    cooked: bool
    cooked_by: Optional[int] = None


class PlanEntryRead(BaseModel):
    id: int
    household_id: int
    date: date
    main_dish_id: Optional[int]
    dessert_dish_id: Optional[int]
    entree_dish_id: Optional[int] = None
    free_text: Optional[str]
    planned_by: Optional[int]
    cooked: bool
    cooked_by: Optional[int]
    cooked_at: Optional[datetime]
    updated_at: datetime
    main_dish: Optional[DishRead] = None
    dessert_dish: Optional[DishRead] = None
    entree_dish: Optional[DishRead] = None


class ShoppingWeekSummary(BaseModel):
    iso_year: int
    iso_week: int
    item_count: int
    checked_count: int


class ShoppingCategoryRead(BaseModel):
    id: int
    name: str
    color: str
    sort_order: int
    type_key: Optional[str] = None


class ShoppingCategoryCreate(BaseModel):
    name: str
    color: str = "#888888"


class ShoppingCategoryUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    sort_order: Optional[int] = None


class IngredientMapEntry(BaseModel):
    ingredient_key: str
    category_id: Optional[int] = None


class ShoppingItem(BaseModel):
    text: str
    checked: bool = False
    category_id: Optional[int] = None


class ShoppingListRead(BaseModel):
    iso_year: int
    iso_week: int
    items: list[ShoppingItem]


class ShoppingListUpdate(BaseModel):
    items: list[ShoppingItem]


class TrackingEntry(BaseModel):
    dish: DishRead
    category: str
    count: int
    status: str


class SettingsRead(BaseModel):
    weekday_category_map: dict[str, str]
    dessert_enabled: bool


class SettingsUpdate(BaseModel):
    weekday_category_map: Optional[dict[str, str]] = None
    dessert_enabled: Optional[bool] = None
