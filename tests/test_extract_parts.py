from app.routers.import_url import _extract_recipe_parts


def test_sections_classiques():
    """Légende YouTube typique avec sections nommées."""
    desc = """Recette du poulet yassa maison !
Pour 4 personnes

Ingrédients :
- 1 kg de poulet
- 4 oignons
- 2 citrons
- 10 cl d'huile
- Sel, poivre

Préparation :
1. Faire mariner le poulet avec le jus de citron.
2. Ajouter 2 cuillères à soupe de moutarde et mélanger.
3. Cuire 45 minutes à feu doux.

Bon appétit !
#yassa #recette #senegal"""
    ingredients, steps = _extract_recipe_parts(desc)
    assert ingredients == ["1 kg de poulet", "4 oignons", "2 citrons", "10 cl d'huile", "Sel, poivre"]
    assert steps == [
        "Faire mariner le poulet avec le jus de citron.",
        "Ajouter 2 cuillères à soupe de moutarde et mélanger.",
        "Cuire 45 minutes à feu doux.",
    ]


def test_pas_de_melange():
    """Aucune ligne ne doit apparaître dans les deux listes."""
    desc = """Ingrédients :
200 g de farine
3 œufs
50 cl de lait

Étapes :
Verser 200 g de farine dans un saladier.
Ajouter les 3 œufs un à un.
Incorporer 50 cl de lait petit à petit."""
    ingredients, steps = _extract_recipe_parts(desc)
    # Les étapes contiennent des quantités mais ne doivent PAS être des ingrédients
    assert len(ingredients) == 3
    assert len(steps) == 3
    assert not set(i.lower() for i in ingredients) & set(s.lower() for s in steps)


def test_etape_mentionnant_le_mot_ingredients():
    """« Mélangez les ingrédients secs » ne doit pas ouvrir une section
    ingrédients (ancien bug : les étapes suivantes devenaient des courses)."""
    desc = """Préparation :
Mélangez les ingrédients secs dans un bol.
Ajoutez le beurre fondu.
Enfournez 25 minutes à 180°C."""
    ingredients, steps = _extract_recipe_parts(desc)
    assert ingredients == []
    assert steps == [
        "Mélangez les ingrédients secs dans un bol.",
        "Ajoutez le beurre fondu.",
        "Enfournez 25 minutes à 180°C.",
    ]


def test_sans_sections():
    """Caption Instagram sans titres de section."""
    desc = """Ma tarte aux pommes préférée !
3 pommes golden
150 g de farine
80 g de beurre
Étaler la pâte dans le moule et piquer à la fourchette.
Disposer les pommes et saupoudrer de sucre.
Enfourner 30 minutes à 180°C."""
    ingredients, steps = _extract_recipe_parts(desc)
    assert ingredients == ["3 pommes golden", "150 g de farine", "80 g de beurre"]
    assert steps == [
        "Étaler la pâte dans le moule et piquer à la fourchette.",
        "Disposer les pommes et saupoudrer de sucre.",
        "Enfourner 30 minutes à 180°C.",
    ]


def test_verbes_etendus():
    """Les verbes autrefois inconnus (battre, fouetter…) sont des étapes."""
    desc = """Ingrédients :
4 œufs
100 g de sucre

Préparation :
Battre les œufs avec le sucre.
Fouetter jusqu'à ce que le mélange blanchisse."""
    ingredients, steps = _extract_recipe_parts(desc)
    assert "4 œufs" in ingredients
    assert "Battre les œufs avec le sucre." in steps
    assert "Fouetter jusqu'à ce que le mélange blanchisse." in steps


def test_section_ustensiles_ignoree():
    desc = """Ingrédients :
2 courgettes

Ustensiles :
1 saladier
1 fouet

Préparation :
Couper les courgettes en rondelles."""
    ingredients, steps = _extract_recipe_parts(desc)
    assert ingredients == ["2 courgettes"]
    assert "1 saladier" not in ingredients
    assert steps == ["Couper les courgettes en rondelles."]


def test_arret_aux_hashtags():
    desc = """Ingrédients :
1 kg de riz
2 tomates
500 g de poisson

#thieb #recette #200g de bonheur"""
    ingredients, steps = _extract_recipe_parts(desc)
    assert ingredients == ["1 kg de riz", "2 tomates", "500 g de poisson"]
    assert steps == []


def test_instagram_moussaka_reel():
    """Cas réel : reel Instagram avec sous-sections emoji, verbes en « tu »,
    préfixe « 164K likes », prose d'intro et hashtags de fin."""
    from app.routers.import_url import _strip_source_prefix

    raw = (
        "164K likes, 531 comments - miamzozo on September 24, 2025: "
        '"✨ MOUSSAKA 🍆\n\n'
        "Je sais pas toi, mais ce plat fait partie de mes traumatismes.\n"
        "Alors voilà la recette qui va tout changer 👇\n\n"
        "🥩 Pour la viande :\n\n"
        "* 300 g de bœuf haché\n"
        "* 1 petit oignon haché\n"
        "* 150 g de purée de tomate\n\n"
        "Fais revenir l'ail et l'oignon dans un filet d'huile d'olive, ajoute la viande.\n"
        "Laisse mijoter à feu doux jusqu'à ce que la sauce épaississe.\n\n"
        "🍆 Pour les légumes :\n\n"
        "* 1 grosse aubergine\n"
        "* Huile d'olive\n"
        "* Sel\n\n"
        "Coupe les légumes en tranches. Étale-les sur une plaque et enfourne à 200°C.\n\n"
        "🧱 Montage :\n\n"
        "1. Dispose les pommes de terre dans le fond du plat\n"
        "2. Ajoute le ragoût de viande\n"
        "3. Enfourne à 180°C pendant 35 minutes.\n\n"
        "Et maintenant… régale-toi ! 😋\n\n"
        "#moussakamaison #recettefacile"
    )
    clean = _strip_source_prefix(raw)
    # Le préfixe "164K likes … :" doit disparaître
    assert not clean.startswith("164K")

    ingredients, steps = _extract_recipe_parts(clean)

    # Ingrédients : les 3 sous-sections, y compris ceux sans quantité
    assert "300 g de bœuf haché" in ingredients
    assert "Huile d'olive" in ingredients
    assert "Sel" in ingredients

    # Étapes : verbes en « tu » (Fais, Coupe, Dispose, Ajoute, Enfourne)
    assert any(s.startswith("Fais revenir") for s in steps)
    assert any(s.startswith("Coupe les légumes") for s in steps)
    assert any(s.startswith("Dispose les pommes") for s in steps)

    # Aucune instruction dans les ingrédients, aucun ingrédient dans les étapes
    assert not any(_VERB(s) for s in ingredients), f"instruction dans ingrédients: {ingredients}"
    # La prose d'intro et les hashtags ne doivent apparaître nulle part
    joined = " ".join(ingredients + steps).lower()
    assert "traumatismes" not in joined
    assert "#moussaka" not in joined
    assert "régale" not in joined


def _VERB(line: str) -> bool:
    from app.routers.import_url import _INSTRUCTION_VERB
    return bool(_INSTRUCTION_VERB.match(line))


def test_clean_social_title():
    """Le nom de plat doit être court et lisible, pas la légende entière."""
    from app.routers.import_url import _clean_social_title

    # Titre OG Instagram = « Auteur on Instagram: <légende> » → nom propre
    caption = "✨ MOUSSAKA 🍆\n\nJe sais pas toi mais ce plat...\n* 300 g de bœuf"
    og = f'Zoé Boury on Instagram: "{caption}'
    assert _clean_social_title(og, caption) == "Moussaka"

    # Emoji décoratifs retirés, prose d'intro ignorée
    assert _clean_social_title("", "🍰 Tarte aux pommes 🍏\n3 pommes") == "Tarte aux pommes"
    assert _clean_social_title("", "Je te montre ma recette\n\nCROQUE MONSIEUR\npain") == "Croque monsieur"

    # Repli sur le titre OG quand la légende ne donne rien d'exploitable
    assert _clean_social_title("Chef on TikTok: Poulet DG", "phrase beaucoup trop longue " * 5) == "Poulet DG"


def test_vide():
    assert _extract_recipe_parts("") == ([], [])
    assert _extract_recipe_parts("Juste une phrase sans recette.") == ([], [])


def test_ingredient_descriptif_reste_ingredient():
    """Un ingrédient contenant un verbe/préparation ne doit pas basculer en étape
    tant qu'il ne COMMENCE pas par un verbe d'action."""
    desc = """Ingrédients :
- 250 g de beurre mou, à sortir à l'avance
- 2 oignons émincés finement
- 3 tomates coupées en dés
- 1 citron

Préparation :
Mélanger le tout.
Cuire 20 minutes."""
    ingredients, steps = _extract_recipe_parts(desc)
    assert "250 g de beurre mou, à sortir à l'avance" in ingredients
    assert "2 oignons émincés finement" in ingredients
    assert "3 tomates coupées en dés" in ingredients
    assert "1 citron" in ingredients
    # Ces lignes ne doivent PAS se retrouver dans les étapes
    assert not any("beurre mou" in s.lower() for s in steps)
    assert not any("émincés" in s.lower() for s in steps)
    # Les vraies étapes restent des étapes
    assert "Mélanger le tout." in steps
    assert "Cuire 20 minutes." in steps


def test_verbes_courants_couper_raper():
    """Verbes courants longtemps absents (couper, râper, émincer, presser…) :
    une ligne qui commence par ces verbes est une étape, pas un ingrédient."""
    desc = """Ma salade express
2 carottes
1 citron
Râper les carottes finement.
Presser le citron par-dessus.
Couper le tout et mélanger."""
    ingredients, steps = _extract_recipe_parts(desc)
    assert "2 carottes" in ingredients
    assert "1 citron" in ingredients
    assert any(s.startswith("Râper") for s in steps)
    assert any(s.startswith("Presser") for s in steps)
    assert any(s.startswith("Couper") for s in steps)
    # aucune étape égarée dans les ingrédients
    assert not any(v in " ".join(ingredients).lower() for v in ("râper", "presser", "couper"))
