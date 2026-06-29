import re
from sqlmodel import Session, select
from app.db import engine, create_db_and_tables
from app.models import Household, Settings, Dish
from app.auth import hash_passcode
from app.config import settings

KNOWN_TAGS = {"MC", "deglaze", "insta", "BMK", "khantoche"}

SEED_DATA: dict[str, list[str]] = {
    "pomme_de_terre": [
        "Tartiflette (MC)",
        "Pomme de terre au four + poulet + haricot",
        "Purée + Viande",
        "Frittes + burger",
        "Poulet aux olives + PDT",
        "Poisson + pomme noisette + petit poids",
        "Purée + Poulet",
        "Frittes + Tenders",
        "Steak hachée + pomme noisette + haricot",
        "Gratin de pomme de terre",
        "Caprice des dieux pané + pdt au four + haricot",
        "Ragout de boeuf aux carottes et pdt (deglaze)",
        "Roulet de pdt poulet (deglaze)",
        "Moussaka (deglaze)",
        "Pdt au four + Rumsteak + haricot",
        "Hachi parmentier",
        "Sauté de boeuf + PDT à la sauce sweet chili (deglaze)",
        "Pain farci façon tartiflette (deglaze)",
        "Souris d'agneau + frittes",
        "Gigot d'agneau à la poele + frittes (insta)",
        "Gratin de pdt à a la vache kiri viande hachee (insta)",
    ],
    "riz": [
        "Lasagne aubergines à la viande hachée + riz",
        "Soupoukandia",
        "Mafé",
        "Riz thai + escalope panée",
        "Ratatouille",
        "Riz + poulet caramélisé",
        "Boeuf/poulet loc lac + riz (insta)",
        "Butter chicken",
        "Riz au cury",
        "Riz crème faiche + poisson + petit poids",
        "Chili con carne (deglaze)",
        "Poulet kuku paka (BMK)",
        "Tiebouyap (BMK)",
        "Curry de poulet à la thai (MC)",
        "Brochette de poulet Suya (BMK)",
        "Brochette de boeuf à la citronelle (khantoche) + riz",
        "Boeuf Locloc (khantoche)",
    ],
    "pates": [
        "Lasagne bolognaise",
        "Pate au pesto",
        "Pate bolo",
        "Spaghetti boulette de viande",
        "Pate au poulet creme fraiche",
        "Lasagne poulet",
        "Pate carbonnara",
        "Poulet orzo (deglaze)",
        "Lasagne epinard escalope (deglaze)",
        "Meat Pasta (Deglaze)",
        "Boeuf effiloché (deglaze) + pate",
    ],
    "autre": [
        "Croque monsieur",
        "Quiche au thon",
        "Atieke Aloco,+ poulet",
        "Fajitas",
        "Tacos cordon bleu",
        "Tortilla de viande hachée + tabasco + mais + cheddar + (guacamole)",
        "Feuilleté viande hachée",
        "Fataya géante (deglaze)",
        "Brick poulet boursin (deglaze)",
        "Chorba (insta)",
        "Aloco + viande hachée (deglaze)",
        "Pastilla au poulet (MC)",
        "lentille (MC) + saucisse",
        "Nems poulet (Khantoche",
        "Banh mi (khantoche)",
        "Bao burger (khantoche)",
    ],
    "sucree": [
        "Doowap (deglaze)",
        "carrot cake (deglaze) (MC)",
        "Cheeze cake speculos (deglaze)",
        "Verine framboise pistache (deglaze)",
        "cinamon roll",
        "Tiramisu cookie",
        "Canistrelli",
        "Brownies americain (MC)",
        "Cookies gourmand (MC)",
        "Tarte au flan sans pate (MC)",
        "Tiramisu aux fraises (MC)",
        "Gauffres (MC)",
        "Crumble aux pommes (MC)",
        "Flan patissier (MC)",
        "Tartes aux fraises (MC)",
        "Brownie de louise (MC)",
        "Tiramisu classique (MC)",
    ],
    "africain": [
        "Soupoukandia",
        "Mafé",
        "Tiebouyap (BMK)",
        "Atieke Aloco,+ poulet",
    ],
}


def extract_source_tag(name: str) -> tuple[str, str | None]:
    """Extract source_tag from last parenthesis without altering name."""
    match = re.search(r"\(([^)]+)\)\s*$", name)
    if match:
        tag_candidate = match.group(1).strip()
        for known in KNOWN_TAGS:
            if tag_candidate.lower() == known.lower():
                return name, known
    return name, None


def run_seed() -> None:
    create_db_and_tables()
    with Session(engine) as session:
        household = session.exec(select(Household)).first()
        if not household:
            household = Household(
                name="Ma Famille",
                passcode_hash=hash_passcode(settings.household_passcode),
            )
            session.add(household)
            session.commit()
            session.refresh(household)

            sett = Settings(household_id=household.id)
            session.add(sett)
            session.commit()

        existing_keys = set(
            session.exec(
                select(Dish.name, Dish.category).where(
                    Dish.household_id == household.id
                )
            ).all()
        )

        added = 0
        for category, names in SEED_DATA.items():
            for order, name in enumerate(names):
                original_name = name
                _, source_tag = extract_source_tag(name)
                if (original_name, category) not in existing_keys:
                    dish = Dish(
                        household_id=household.id,
                        name=original_name,
                        category=category,
                        source_tag=source_tag,
                        seed_order=order,
                        active=True,
                    )
                    session.add(dish)
                    existing_keys.add((original_name, category))
                    added += 1

        session.commit()
        print(f"Seed terminé : {added} plats ajoutés.")


if __name__ == "__main__":
    run_seed()
