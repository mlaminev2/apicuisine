import io
from unittest.mock import patch



def _png_bytes():
    # PNG 2x2 minimal valide
    import struct
    import zlib
    def chunk(t, d): return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d))
    ihdr = struct.pack(">IIBBBBB", 2, 2, 8, 2, 0, 0, 0)
    raw = b"\x00\xff\xff\xff\xff\xff\xff\x00\xff\xff\xff\xff\xff\xff"
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")


def test_import_photo_ocr_extraction(client, household, auth_headers):
    sample = "Ingredients\n200 g farine\n3 oeufs\nPreparation\nMelanger la farine et les oeufs\nCuire 25 minutes"
    with patch("app.services.ocr.ocr_available", return_value=True), \
         patch("app.services.ocr.image_to_text", return_value=sample.replace("\n", "\n")):
        res = client.post(
            "/api/import-photo",
            files={"file": ("recette.png", io.BytesIO(_png_bytes()), "image/png")},
            headers=auth_headers,
        )
    assert res.status_code == 200
    data = res.json()
    assert any("farine" in i.lower() for i in data["ingredients"])
    assert data["steps"]  # au moins une étape détectée


def test_import_photo_unavailable(client, household, auth_headers):
    with patch("app.services.ocr.ocr_available", return_value=False):
        res = client.post(
            "/api/import-photo",
            files={"file": ("r.png", io.BytesIO(_png_bytes()), "image/png")},
            headers=auth_headers,
        )
    assert res.status_code == 503


def test_import_photo_rejects_non_image(client, household, auth_headers):
    with patch("app.services.ocr.ocr_available", return_value=True):
        res = client.post(
            "/api/import-photo",
            files={"file": ("r.txt", io.BytesIO(b"hello"), "text/plain")},
            headers=auth_headers,
        )
    assert res.status_code == 415
