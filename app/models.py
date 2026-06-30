from datetime import datetime, date
from typing import Optional
from sqlmodel import Field, SQLModel, UniqueConstraint


class Household(SQLModel, table=True):
    __tablename__ = "household"
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    passcode_hash: Optional[str] = Field(default=None)
    invite_code: Optional[str] = Field(default=None)
    invite_code_created_at: Optional[datetime] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Member(SQLModel, table=True):
    __tablename__ = "member"
    id: Optional[int] = Field(default=None, primary_key=True)
    household_id: int = Field(foreign_key="household.id")
    name: str
    color: str = Field(default="#4B8FA6")
    email: Optional[str] = Field(default=None, unique=True, index=True)
    password_hash: Optional[str] = Field(default=None)
    is_owner: bool = Field(default=False)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Dish(SQLModel, table=True):
    __tablename__ = "dish"
    id: Optional[int] = Field(default=None, primary_key=True)
    household_id: int = Field(foreign_key="household.id")
    name: str
    category: str
    source_tag: Optional[str] = Field(default=None)
    seed_order: int = Field(default=0)
    active: bool = Field(default=True)
    ingredients: str = Field(default="[]")
    instructions: str = Field(default="[]")
    source_url: Optional[str] = Field(default=None)
    thumbnail_url: Optional[str] = Field(default=None)
    author: Optional[str] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow)


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
    free_text: Optional[str] = Field(default=None)
    planned_by: Optional[int] = Field(default=None, foreign_key="member.id")
    cooked: bool = Field(default=False)
    cooked_by: Optional[int] = Field(default=None, foreign_key="member.id")
    cooked_at: Optional[datetime] = Field(default=None)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class ShoppingList(SQLModel, table=True):
    __tablename__ = "shopping_list"
    __table_args__ = (UniqueConstraint("household_id", "iso_year", "iso_week"),)
    id: Optional[int] = Field(default=None, primary_key=True)
    household_id: int = Field(foreign_key="household.id")
    iso_year: int
    iso_week: int
    items: str = Field(default="[]")
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class Settings(SQLModel, table=True):
    __tablename__ = "settings"
    household_id: int = Field(foreign_key="household.id", primary_key=True)
    weekday_category_map: str = Field(
        default='{"0":"pomme_de_terre","1":"riz","2":"pates","3":"pomme_de_terre","4":"riz","5":"autre","6":"africain"}'
    )
    dessert_enabled: bool = Field(default=True)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
