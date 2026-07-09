import json as _json
from datetime import datetime, date
from typing import Optional
from pydantic import BaseModel, Field, field_validator


class LoginRequest(BaseModel):
    email: str = Field(max_length=200)
    password: str = Field(max_length=128)


class LoginResponse(BaseModel):
    token: str
    household_id: int
    household_name: str
    member_id: int
    member_name: str
    is_owner: bool


class RegisterRequest(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    email: str = Field(max_length=200)
    password: str = Field(min_length=8, max_length=128)
    color: str = Field(default="#4B8FA6", max_length=20)
    invite_code: Optional[str] = Field(default=None, max_length=20)


class ForgotPasswordRequest(BaseModel):
    email: str = Field(max_length=200)


class ResetPasswordRequest(BaseModel):
    token: str = Field(max_length=2000)
    new_password: str = Field(min_length=8, max_length=128)


class PasswordChangeRequest(BaseModel):
    current_password: str = Field(max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


class MemberRead(BaseModel):
    id: int
    name: str
    color: str
    email: str
    is_owner: bool
    is_premium: bool = False
    created_at: datetime


class MemberPremiumUpdate(BaseModel):
    is_premium: bool


class AccessRead(BaseModel):
    freemium_enabled: bool
    is_owner: bool
    is_premium: bool
    premium_active: bool  # le membre courant a-t-il accès aux fonctions premium ?
    is_admin: bool = False  # accès à l'espace admin (super admin)
    hide_ads: bool = False  # masquer les publicités (compte premium payé ou admin)
    can_manage_billing: bool = False  # a un abonnement Stripe (accès au portail client)
    import_limit: Optional[int] = None      # null = illimité
    imports_remaining: Optional[int] = None  # null = illimité


class InviteRead(BaseModel):
    invite_code: Optional[str]
    invite_code_created_at: Optional[datetime]


class DishCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    category: str


class DishUpdate(BaseModel):
    name: Optional[str] = Field(default=None, max_length=200)
    category: Optional[str] = None
    active: Optional[bool] = None
    ingredients: Optional[list[str]] = None
    instructions: Optional[list[str]] = None
    thumbnail_url: Optional[str] = Field(default=None, max_length=500)
    author: Optional[str] = Field(default=None, max_length=200)


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
    apero_dish_id: Optional[int] = None
    sauce_dish_id: Optional[int] = None
    free_text: Optional[str] = Field(default=None, max_length=500)
    lunch_dish_id: Optional[int] = None
    lunch_free_text: Optional[str] = Field(default=None, max_length=500)
    extra_dish_ids: Optional[list[int]] = Field(default=None, max_length=10)
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
    apero_dish_id: Optional[int] = None
    sauce_dish_id: Optional[int] = None
    free_text: Optional[str]
    lunch_dish_id: Optional[int] = None
    lunch_free_text: Optional[str] = None
    extra_dish_ids: list[int] = []
    planned_by: Optional[int]
    cooked: bool
    cooked_by: Optional[int]
    cooked_at: Optional[datetime]
    updated_at: datetime
    main_dish: Optional[DishRead] = None
    dessert_dish: Optional[DishRead] = None
    entree_dish: Optional[DishRead] = None
    apero_dish: Optional[DishRead] = None
    sauce_dish: Optional[DishRead] = None
    lunch_dish: Optional[DishRead] = None
    extra_dishes: list[DishRead] = []


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
    name: str = Field(min_length=1, max_length=50)
    color: str = Field(default="#888888", max_length=20)


class ShoppingCategoryUpdate(BaseModel):
    name: Optional[str] = Field(default=None, max_length=50)
    color: Optional[str] = Field(default=None, max_length=20)
    sort_order: Optional[int] = None


class IngredientMapEntry(BaseModel):
    ingredient_key: str
    category_id: Optional[int] = None


class ShoppingItem(BaseModel):
    text: str = Field(max_length=300)
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
    lunch_enabled: bool
    multi_dish_enabled: bool
    freemium_enabled: bool


class SettingsUpdate(BaseModel):
    weekday_category_map: Optional[dict[str, str]] = None
    dessert_enabled: Optional[bool] = None
    lunch_enabled: Optional[bool] = None
    multi_dish_enabled: Optional[bool] = None
    freemium_enabled: Optional[bool] = None
