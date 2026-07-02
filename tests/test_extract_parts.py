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


def test_vide():
    assert _extract_recipe_parts("") == ([], [])
    assert _extract_recipe_parts("Juste une phrase sans recette.") == ([], [])
