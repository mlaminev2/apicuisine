from datetime import datetime, date, timezone
from typing import Optional
from sqlalchemy import Text
from sqlmodel import Field, SQLModel, UniqueConstraint


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Household(SQLModel, table=True):
    __tablename__ = "household"
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    passcode_hash: Optional[str] = Field(default=None)
    invite_code: Optional[str] = Field(default=None)
    invite_code_created_at: Optional[datetime] = Field(default=None)
    created_at: datetime = Field(default_factory=_utcnow)


class Member(SQLModel, table=True):
    __tablename__ = "member"
    id: Optional[int] = Field(default=None, primary_key=True)
    household_id: int = Field(foreign_key="household.id")
    name: str
    color: str = Field(default="#4B8FA6")
    email: Optional[str] = Field(default=None, unique=True, index=True)
    password_hash: Optional[str] = Field(default=None)
    is_owner: bool = Field(default=False)
    is_premium: bool = Field(default=False)  # accès premium accordé par le propriétaire
    import_count: int = Field(default=0)               # imports consommés sur le mois courant
    import_month: Optional[str] = Field(default=None)  # mois du compteur, format "YYYY-MM"
    oauth_provider: Optional[str] = Field(default=None)   # "google" | "apple"
    oauth_sub: Optional[str] = Field(default=None)        # identifiant unique chez le provider
    token_version: int = Field(default=0)  # incrémenté pour révoquer tous les tokens émis
    created_at: datetime = Field(default_factory=_utcnow)


class Dish(SQLModel, table=True):
    __tablename__ = "dish"
    id: Optional[int] = Field(default=None, primary_key=True)
    household_id: int = Field(foreign_key="household.id")
    name: str
    category: str
    source_tag: Optional[str] = Field(default=None)
    seed_order: int = Field(default=0)
    active: bool = Field(default=True)
    ingredients: str = Field(default="[]", sa_type=Text)
    instructions: str = Field(default="[]", sa_type=Text)
    source_url: Optional[str] = Field(default=None, sa_type=Text)
    thumbnail_url: Optional[str] = Field(default=None, sa_type=Text)
    author: Optional[str] = Field(default=None)
    created_at: datetime = Field(default_factory=_utcnow)


class ShoppingCategory(SQLModel, table=True):
    __tablename__ = "shopping_category"
    id: Optional[int] = Field(default=None, primary_key=True)
    household_id: int = Field(foreign_key="household.id")
    name: str
    color: str = Field(default="#888888")
    sort_order: int = Field(default=99)
    type_key: Optional[str] = Field(default=None)


class IngredientMap(SQLModel, table=True):
    __tablename__ = "ingredient_map"
    id: Optional[int] = Field(default=None, primary_key=True)
    household_id: int = Field(foreign_key="household.id")
    ingredient_key: str
    category_id: Optional[int] = Field(default=None, foreign_key="shopping_category.id")


class PlanEntry(SQLModel, table=True):
    __tablename__ = "plan_entry"
    __table_args__ = (UniqueConstraint("household_id", "date"),)
    id: Optional[int] = Field(default=None, primary_key=True)
    household_id: int = Field(foreign_key="household.id")
    date: date
    main_dish_id: Optional[int] = Field(default=None, foreign_key="dish.id")
    dessert_dish_id: Optional[int] = Field(default=None, foreign_key="dish.id")
    entree_dish_id: Optional[int] = Field(default=None, foreign_key="dish.id")
    free_text: Optional[str] = Field(default=None, sa_type=Text)
    lunch_dish_id: Optional[int] = Field(default=None, foreign_key="dish.id")
    lunch_free_text: Optional[str] = Field(default=None, sa_type=Text)
    extra_dishes: str = Field(default="[]", sa_type=Text)  # ids JSON des plats supplémentaires du soir
    planned_by: Optional[int] = Field(default=None, foreign_key="member.id")
    cooked: bool = Field(default=False)
    cooked_by: Optional[int] = Field(default=None, foreign_key="member.id")
    cooked_at: Optional[datetime] = Field(default=None)
    updated_at: datetime = Field(default_factory=_utcnow)


class ShoppingList(SQLModel, table=True):
    __tablename__ = "shopping_list"
    __table_args__ = (UniqueConstraint("household_id", "iso_year", "iso_week"),)
    id: Optional[int] = Field(default=None, primary_key=True)
    household_id: int = Field(foreign_key="household.id")
    iso_year: int
    iso_week: int
    items: str = Field(default="[]", sa_type=Text)
    updated_at: datetime = Field(default_factory=_utcnow)


class Settings(SQLModel, table=True):
    __tablename__ = "settings"
    household_id: int = Field(foreign_key="household.id", primary_key=True)
    weekday_category_map: str = Field(
        default='{"0":"pomme_de_terre","1":"riz","2":"pates","3":"pomme_de_terre","4":"riz","5":"autre","6":"africain"}',
        sa_type=Text,
    )
    dessert_enabled: bool = Field(default=True)
    lunch_enabled: bool = Field(default=False)
    multi_dish_enabled: bool = Field(default=False)
    freemium_enabled: bool = Field(default=False)
    updated_at: datetime = Field(default_factory=_utcnow)
