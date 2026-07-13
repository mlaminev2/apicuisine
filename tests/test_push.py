"""Tests des endpoints de notifications push."""


def test_push_config_exposes_key(client):
    res = client.get("/api/push/config")
    assert res.status_code == 200
    body = res.json()
    assert "enabled" in body and "public_key" in body


def test_subscribe_sets_reminder_and_stores(client, auth_headers, monkeypatch):
    from app.config import settings as cfg
    # Force l'activation du push pour le test (clés factices).
    monkeypatch.setattr(cfg, "vapid_public_key", "test-pub")
    monkeypatch.setattr(cfg, "vapid_private_key_b64", "test-priv")

    sub = {"endpoint": "https://push.example/abc", "keys": {"p256dh": "k1", "auth": "a1"}}
    res = client.post("/api/push/subscribe", json=sub, headers=auth_headers)
    assert res.status_code == 204

    # L'accès reflète l'activation du rappel.
    access = client.get("/api/access", headers=auth_headers).json()
    assert access["reminder_enabled"] is True

    # Ré-abonnement avec le même endpoint : pas de doublon, toujours 204.
    res2 = client.post("/api/push/subscribe", json=sub, headers=auth_headers)
    assert res2.status_code == 204

    # Le désabonnement nettoie tout et désactive le rappel.
    res3 = client.post("/api/push/unsubscribe", headers=auth_headers)
    assert res3.status_code == 204
    access2 = client.get("/api/access", headers=auth_headers).json()
    assert access2["reminder_enabled"] is False


def test_subscribe_requires_push_enabled(client, auth_headers, monkeypatch):
    from app.config import settings as cfg
    monkeypatch.setattr(cfg, "vapid_public_key", "")
    monkeypatch.setattr(cfg, "vapid_private_key_b64", "")
    sub = {"endpoint": "https://push.example/x", "keys": {"p256dh": "k", "auth": "a"}}
    res = client.post("/api/push/subscribe", json=sub, headers=auth_headers)
    assert res.status_code == 503


def test_test_push_without_subscription(client, auth_headers):
    res = client.post("/api/push/test", headers=auth_headers)
    assert res.status_code == 404
