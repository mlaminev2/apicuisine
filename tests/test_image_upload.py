import io
from pathlib import Path

from PIL import Image


def _big_png_bytes(w=2400, h=1800):
    img = Image.new("RGB", (w, h), (200, 60, 40))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def test_upload_image_is_resized_and_jpeg(client, auth_headers):
    # Crée un plat
    d = client.post("/api/dishes", json={"name": "Photo Test", "category": "riz"}, headers=auth_headers)
    dish_id = d.json()["id"]

    raw = _big_png_bytes()
    res = client.post(
        f"/api/dishes/{dish_id}/image",
        files={"file": ("photo.png", raw, "image/png")},
        headers=auth_headers,
    )
    assert res.status_code == 200
    url = res.json()["thumbnail_url"]
    assert url.startswith(f"/uploads/dish_{dish_id}.jpg?v=")

    # Le fichier réellement écrit est un JPEG redimensionné et bien plus léger.
    uploads = Path(__file__).parent.parent / "web" / "uploads"
    f = uploads / f"dish_{dish_id}.jpg"
    try:
        assert f.is_file()
        with Image.open(f) as im:
            assert im.format == "JPEG"
            assert max(im.size) <= 1280
        assert f.stat().st_size < len(raw)  # compressé
    finally:
        for p in uploads.glob(f"dish_{dish_id}.*"):
            p.unlink(missing_ok=True)
