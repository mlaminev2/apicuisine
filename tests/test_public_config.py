def test_public_config_empty_by_default(client):
    res = client.get("/api/public-config")
    assert res.status_code == 200
    assert res.json() == {"gtm_container_id": "", "ga_measurement_id": "", "meta_pixel_id": "", "adsense_client_id": ""}


def test_public_config_reports_ids(client):
    from app.config import settings as app_config
    ga, px = app_config.ga_measurement_id, app_config.meta_pixel_id
    app_config.ga_measurement_id = "G-TEST123"
    app_config.meta_pixel_id = "999888777"
    try:
        d = client.get("/api/public-config").json()
        assert d["ga_measurement_id"] == "G-TEST123"
        assert d["meta_pixel_id"] == "999888777"
    finally:
        app_config.ga_measurement_id, app_config.meta_pixel_id = ga, px
