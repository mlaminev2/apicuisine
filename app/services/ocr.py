"""OCR local (Tesseract) pour l'import de recettes depuis une photo.

Dépendances système : tesseract-ocr + tesseract-ocr-fra (installées dans le
Dockerfile). En leur absence (dev local sous Windows), ocr_available() renvoie
False et l'endpoint répond proprement au lieu de planter.
"""
import io
import logging

logger = logging.getLogger(__name__)

try:
    import pytesseract
    from PIL import Image, ImageOps
    _IMPORTS_OK = True
except Exception:  # pragma: no cover - dépend de l'environnement
    _IMPORTS_OK = False


def ocr_available() -> bool:
    if not _IMPORTS_OK:
        return False
    try:
        pytesseract.get_tesseract_version()
        return True
    except Exception:
        return False


def image_to_text(data: bytes) -> str:
    """Extrait le texte d'une image (JPEG/PNG/WebP). Réduit les grandes photos
    pour accélérer l'OCR, corrige l'orientation EXIF, passe en niveaux de gris."""
    img = Image.open(io.BytesIO(data))
    img = ImageOps.exif_transpose(img)
    img = img.convert("L")  # niveaux de gris : meilleur pour l'OCR
    max_side = 2200
    if max(img.size) > max_side:
        ratio = max_side / max(img.size)
        img = img.resize((int(img.width * ratio), int(img.height * ratio)))
    # fra+eng : gère les recettes françaises et les termes anglais courants
    try:
        text = pytesseract.image_to_string(img, lang="fra+eng")
    except Exception:
        text = pytesseract.image_to_string(img)  # repli si pack fra absent
    return text.strip()
