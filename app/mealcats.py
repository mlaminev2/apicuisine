"""Catégories de plats (« roulement de la semaine »), personnalisables par foyer.

Par défaut, tout foyer utilise DEFAULT_CATEGORIES. Dès qu'il personnalise sa
liste, elle est stockée en JSON dans Settings.meal_categories (source de vérité).
"""
import json
import re
import unicodedata

# Catégories fournies par défaut (clé, libellé, classe de couleur CSS).
DEFAULT_CATEGORIES = [
    {"key": "pomme_de_terre", "label": "Pomme de terre", "color": "cat-pdt"},
    {"key": "riz", "label": "Riz", "color": "cat-riz"},
    {"key": "pates", "label": "Pâtes", "color": "cat-pates"},
    {"key": "entree", "label": "Entrée", "color": "cat-entree"},
    {"key": "autre", "label": "Autre", "color": "cat-autre"},
    {"key": "sucree", "label": "Sucrée", "color": "cat-sucree"},
    {"key": "africain", "label": "Africain", "color": "cat-africain"},
    {"key": "apero", "label": "Apéro", "color": "cat-apero"},
    {"key": "sauce", "label": "Sauce", "color": "cat-sauce"},
]

# Palette de classes de couleur réutilisables pour les catégories personnalisées.
COLOR_CLASSES = [c["color"] for c in DEFAULT_CATEGORIES]


def slugify(label: str) -> str:
    """Transforme un libellé en clé sûre (ex. « Poisson » -> « poisson »)."""
    txt = unicodedata.normalize("NFD", label or "").encode("ascii", "ignore").decode()
    txt = re.sub(r"[^a-zA-Z0-9]+", "_", txt).strip("_").lower()
    return txt or "cat"


def foyer_categories(sett) -> list[dict]:
    """Liste des catégories du foyer (défauts si non personnalisé)."""
    raw = getattr(sett, "meal_categories", None) if sett else None
    if raw:
        try:
            data = json.loads(raw)
            if isinstance(data, list) and data:
                return data
        except (ValueError, TypeError):
            pass
    return [dict(c) for c in DEFAULT_CATEGORIES]


def foyer_category_keys(sett) -> set[str]:
    return {c["key"] for c in foyer_categories(sett)}


def normalize_categories(items: list) -> list[dict]:
    """Valide et normalise une liste soumise : clés uniques, slug sûr, couleur.

    `items` : liste de dicts {key?, label, color?}. Les clés vides/invalides sont
    régénérées depuis le libellé, les doublons sont suffixés.
    """
    out: list[dict] = []
    seen: set[str] = set()
    for i, it in enumerate(items):
        label = (it.get("label") or "").strip()
        if not label:
            continue
        key = slugify(it.get("key") or label)
        base = key
        n = 2
        while key in seen:
            key = f"{base}_{n}"
            n += 1
        seen.add(key)
        color = it.get("color") or COLOR_CLASSES[i % len(COLOR_CLASSES)]
        if color not in COLOR_CLASSES:
            color = COLOR_CLASSES[i % len(COLOR_CLASSES)]
        out.append({"key": key, "label": label[:40], "color": color})
    return out
