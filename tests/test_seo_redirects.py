"""Normalisation SEO : une seule URL canonique par page (301 sinon).

Corrige le motif « Page avec redirection » de la Search Console en supprimant
les variantes d'URL servies en 200 (contenu dupliqué).
"""

import pytest


@pytest.mark.parametrize(
    "requested, canonical",
    [
        ("/index.html", "/"),
        ("/a-propos.html", "/a-propos"),
        ("/a-propos/", "/a-propos"),
        ("/conseils", "/conseils/"),
        ("/conseils/index.html", "/conseils/"),
        ("/conseils/batch-cooking.html", "/conseils/batch-cooking"),
        ("/conseils/batch-cooking/", "/conseils/batch-cooking"),
        ("/confidentialite.html", "/confidentialite"),
        ("/mentions-legales.html", "/mentions-legales"),
        ("/cgv.html", "/cgv"),
        ("/confidentialite/", "/confidentialite"),
    ],
)
def test_variantes_redirigent_en_301(client, requested, canonical):
    res = client.get(requested, follow_redirects=False)
    assert res.status_code == 301, f"{requested} devrait rediriger"
    assert res.headers["location"] == canonical


@pytest.mark.parametrize(
    "url",
    [
        "/",
        "/a-propos",
        "/conseils/",
        "/conseils/batch-cooking",
        "/conseils/planifier-ses-repas",
        "/confidentialite",
        "/mentions-legales",
        "/cgv",
    ],
)
def test_urls_canoniques_repondent_200(client, url):
    res = client.get(url, follow_redirects=False)
    assert res.status_code == 200


@pytest.mark.parametrize(
    "asset",
    [
        "/robots.txt",
        "/sitemap.xml",
        "/manifest.webmanifest",
        "/sw.js",
        "/css/styles.css",
    ],
)
def test_assets_servis_sans_redirection(client, asset):
    res = client.get(asset, follow_redirects=False)
    assert res.status_code == 200
