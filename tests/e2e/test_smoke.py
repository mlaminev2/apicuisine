"""Test E2E « fumée » : parcourt l'application réelle dans un vrai navigateur.

Exécution : RUN_E2E=1 pytest tests/e2e -q   (nécessite `pip install playwright`
et `playwright install chromium`). Lancé automatiquement par la CI.
"""
import os
import subprocess
import sys
import tempfile
import time
import urllib.request

import pytest

pytestmark = pytest.mark.skipif(
    not os.environ.get("RUN_E2E"), reason="E2E : définir RUN_E2E=1"
)

PORT = 8977
BASE = f"http://127.0.0.1:{PORT}"


@pytest.fixture(scope="module")
def server():
    tmp = tempfile.mkdtemp(prefix="menus-e2e-")
    env = {
        **os.environ,
        "DATABASE_URL": f"sqlite:///{tmp}/menu.db",
        "SECRET_KEY": "e2e-secret-key",
        "APP_ENV": "dev",
    }
    proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "app.main:app", "--port", str(PORT)],
        env=env,
    )
    try:
        for _ in range(120):
            try:
                urllib.request.urlopen(f"{BASE}/api/health", timeout=1)
                break
            except Exception:
                time.sleep(0.5)
        else:
            raise RuntimeError("Le serveur E2E n'a pas démarré")
        yield BASE
    finally:
        proc.terminate()
        proc.wait(timeout=15)


def test_smoke(server):
    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_context(
            viewport={"width": 430, "height": 932}, locale="fr-FR"
        ).new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))

        # Inscription (nouveau foyer vide)
        page.goto(f"{server}/#/inscription")
        page.wait_for_selector("#reg-name", timeout=15000)
        page.fill("#reg-name", "E2E")
        page.fill("#reg-email", "e2e@test.local")
        page.fill("#reg-password", "motdepasse123")
        page.click("button[type=submit]")
        page.wait_for_selector(".bento-grid .bento-hero", timeout=15000)

        # Plats : base vide pour un nouveau foyer
        page.goto(f"{server}/#/base")
        page.wait_for_selector(".empty-state, .plats-grid", timeout=10000)
        assert "Aucun plat" in page.locator("#view-root").text_content()

        # Calendrier : la grille se rend
        page.goto(f"{server}/#/calendrier")
        page.wait_for_selector(".calendar-grid .day-cell", timeout=10000)

        # Mot de passe oublié : la page répond
        page.goto(f"{server}/#/login")
        page.wait_for_selector("#login-form", timeout=10000)
        page.click("text=Mot de passe oublié ?")
        page.wait_for_selector("#forgot-email", timeout=10000)
        page.fill("#forgot-email", "e2e@test.local")
        page.click("#forgot-form button[type=submit]")
        page.wait_for_selector("text=C'est envoyé", timeout=10000)

        assert not errors, f"Erreurs JS : {errors}"
        browser.close()
