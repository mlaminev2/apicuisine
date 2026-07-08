import io
from unittest.mock import patch


def _png_bytes():
    # PNG 2x2 minimal valide
    import struct
    import zlib
    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d))
    ihdr = struct.pack(">IIBBBBB", 2, 2, 8, 2, 0, 0, 0)
    raw = b"\x00\xff\xff\xff\xff\xff\xff\x00\xff\xff\xff\xff\xff\xff"
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")


def _file(name="recette.png", ctype="image/png"):
    return ("files", (name, io.BytesIO(_png_bytes()), ctype))


def test_import_photo_ocr_extraction(client, household, auth_headers):
    sample = "Ingredients\n200 g farine\n3 oeufs\nPreparation\nMelanger la farine et les oeufs\nCuire 25 minutes"
    with patch("app.services.ocr.ocr_available", return_value=True), \
         patch("app.services.ocr.image_to_text", return_value=sample):
        res = client.post("/api/import-photo", files=[_file()], headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert any("farine" in i.lower() for i in data["ingredients"])
    assert data["steps"]


def test_import_photo_multiple_pages(client, household, auth_headers):
    """Recette sur 2 photos : les textes sont fusionnés puis analysés."""
    pages = iter([
        "Ingredients\n200 g farine\n3 oeufs",
        "Preparation\nMelanger le tout\nCuire 20 minutes a la poele",
    ])
    with patch("app.services.ocr.ocr_available", return_value=True), \
         patch("app.services.ocr.image_to_text", side_effect=lambda d: next(pages)):
        res = client.post(
            "/api/import-photo",
            files=[_file("p1.png"), _file("p2.png")],
            headers=auth_headers,
        )
    assert res.status_code == 200
    data = res.json()
    assert any("farine" in i.lower() for i in data["ingredients"])
    assert any("cuire" in s.lower() for s in data["steps"])


def test_import_photo_unavailable(client, household, auth_headers):
    with patch("app.services.ocr.ocr_available", return_value=False):
        res = client.post("/api/import-photo", files=[_file()], headers=auth_headers)
    assert res.status_code == 503


def test_import_photo_rejects_non_image(client, household, auth_headers):
    with patch("app.services.ocr.ocr_available", return_value=True):
        res = client.post("/api/import-photo", files=[_file("r.txt", "text/plain")], headers=auth_headers)
    assert res.status_code == 415
