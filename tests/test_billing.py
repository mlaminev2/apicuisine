"""Paiement Stripe : quand il n'est pas configuré, l'API reste sûre et inactive."""


def test_billing_config_disabled_by_default(client, household, auth_headers):
    res = client.get("/api/billing/config")
    assert res.status_code == 200
    data = res.json()
    assert data["enabled"] is False
    assert data["monthly"] is None and data["yearly"] is None


def test_checkout_refused_when_disabled(client, household, auth_headers):
    res = client.post("/api/billing/checkout", json={"plan": "monthly"}, headers=auth_headers)
    assert res.status_code == 400


def test_portal_refused_when_disabled(client, household, auth_headers):
    res = client.post("/api/billing/portal", headers=auth_headers)
    assert res.status_code == 400


def test_webhook_refused_when_disabled(client, household):
    res = client.post("/api/stripe/webhook", content=b"{}", headers={"stripe-signature": "x"})
    assert res.status_code == 400


def test_access_exposes_billing_flag(client, household, auth_headers):
    data = client.get("/api/access", headers=auth_headers).json()
    assert data["can_manage_billing"] is False
