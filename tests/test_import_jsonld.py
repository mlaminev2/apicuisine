import json

from app.routers.import_url import (
    _is_public_host,
    _parse_recipe_jsonld,
)


def _page(payload) -> str:
    return f'<html><head><script type="application/ld+json">{json.dumps(payload)}</script></head><body></body></html>'


def test_recipe_simple():
    html = _page({
        "@context": "https://schema.org",
        "@type": "Recipe",
        "name": "Poulet Yassa",
        "author": {"@type": "Person", "name": "Awa"},
        "image": "https://example.com/yassa.jpg",
        "description": "Un classique sénégalais.",
        "recipeIngredient": ["1kg de poulet", "4 oignons", "2 citrons"],
        "recipeInstructions": [
            {"@type": "HowToStep", "text": "Faire mariner le poulet."},
            {"@type": "HowToStep", "text": "Cuire les oignons."},
        ],
    })
    r = _parse_recipe_jsonld(html)
    assert r is not None
    assert r["title"] == "Poulet Yassa"
    assert r["author"] == "Awa"
    assert r["thumbnail"] == "https://example.com/yassa.jpg"
    assert r["ingredients"] == ["1kg de poulet", "4 oignons", "2 citrons"]
    assert r["steps"] == ["Faire mariner le poulet.", "Cuire les oignons."]


def test_recipe_in_graph_and_type_list():
    html = _page({
        "@context": "https://schema.org",
        "@graph": [
            {"@type": "WebSite", "name": "Mon blog"},
            {
                "@type": ["Recipe", "NewsArticle"],
                "name": "Tarte aux pommes",
                "image": ["https://example.com/tarte.jpg", "https://example.com/tarte2.jpg"],
                "recipeIngredient": ["3 pommes", "1 pâte brisée"],
                "recipeInstructions": "Étaler la pâte.\nDisposer les pommes.",
            },
        ],
    })
    r = _parse_recipe_jsonld(html)
    assert r is not None
    assert r["title"] == "Tarte aux pommes"
    assert r["thumbnail"] == "https://example.com/tarte.jpg"
    assert r["steps"] == ["Étaler la pâte.", "Disposer les pommes."]


def test_recipe_howto_sections_and_image_object():
    html = _page([{
        "@type": "Recipe",
        "name": "Lasagnes",
        "image": {"@type": "ImageObject", "url": "https://example.com/lasagnes.jpg"},
        "author": [{"name": "Chef Ma"}],
        "recipeIngredient": ["500g de boeuf"],
        "recipeInstructions": [
            {
                "@type": "HowToSection",
                "name": "Sauce",
                "itemListElement": [
                    {"@type": "HowToStep", "text": "Faire revenir la viande."},
                ],
            },
            {"@type": "HowToStep", "text": "Monter les lasagnes."},
        ],
    }])
    r = _parse_recipe_jsonld(html)
    assert r is not None
    assert r["thumbnail"] == "https://example.com/lasagnes.jpg"
    assert r["author"] == "Chef Ma"
    assert r["steps"] == ["Faire revenir la viande.", "Monter les lasagnes."]


def test_no_recipe_returns_none():
    html = _page({"@type": "WebSite", "name": "Pas une recette"})
    assert _parse_recipe_jsonld(html) is None
    assert _parse_recipe_jsonld("<html><body>rien</body></html>") is None


def test_invalid_json_is_skipped():
    html = (
        '<script type="application/ld+json">{pas du json}</script>'
        + _page({"@type": "Recipe", "name": "Ok", "recipeIngredient": ["sel"]})
    )
    r = _parse_recipe_jsonld(html)
    assert r is not None
    assert r["title"] == "Ok"


def test_public_host_blocklist():
    assert _is_public_host("localhost") is False
    assert _is_public_host("127.0.0.1") is False
    assert _is_public_host("192.168.1.1") is False
    assert _is_public_host("10.0.0.5") is False
    assert _is_public_host("169.254.169.254") is False  # metadata cloud
    assert _is_public_host("hote-inexistant-xyz.invalid") is False
