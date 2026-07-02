import html as _html
import json
import re
import unicodedata
import urllib.request
import urllib.parse
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from pydantic import BaseModel, Field
from app.db import get_session
from app.models import Household, Dish, ShoppingList
from app.auth import get_current_household

router = APIRouter(prefix="/api", tags=["import"])

YOUTUBE_OEMBED = "https://www.youtube.com/oembed?url={url}&format=json"
TIKTOK_OEMBED = "https://www.tiktok.com/oembed?url={url}"
_YT_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
# Instagram et TikTok servent les OG tags aux crawlers Facebook
_IG_UA = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)"
_F = re.IGNORECASE | re.DOTALL
_OG_TITLE = re.compile(r'<meta[^>]+property=["\']og:title["\'][^>]+content=["\'](.*?)["\']', _F)
_OG_DESC = re.compile(r'<meta[^>]+property=["\']og:description["\'][^>]+content=["\'](.*?)["\']', _F)
_OG_IMAGE = re.compile(r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\'](.*?)["\']', _F)
# Ordre inversé attributs (content avant property)
_OG_TITLE2 = re.compile(r'<meta[^>]+content=["\'](.*?)["\'][^>]+property=["\']og:title["\']', _F)
_OG_DESC2 = re.compile(r'<meta[^>]+content=["\'](.*?)["\'][^>]+property=["\']og:description["\']', _F)
_OG_IMAGE2 = re.compile(r'<meta[^>]+content=["\'](.*?)["\'][^>]+property=["\']og:image["\']', _F)
_IG_AUTHOR = re.compile(r'^(.+?)\s+(?:on|sur)\s+Instagram', re.IGNORECASE)

# Unités de mesure en français et anglais
_UNIT_RE = re.compile(
    # Avoid bare 'l' and 'g' — they cause false positives in French text (l'ail, etc.)
    # Use full word forms for those units instead
    r"\b(kg|mg|ml|cl|dl|oz|lb|"
    r"grammes?|kilogrammes?|milligrammes?|millilitres?|centilitres?|litres?|"
    r"c\.?\s*[àa]\.?\s*[sc]\.?|cuill?[eè]res?\s*[àa]\s*(?:soupe|caf[eé])|"
    r"tasses?|verres?|pincées?|bouquets?|"
    r"tranches?|morceaux?|filets?|gousses?|branches?|feuilles?|"
    r"boîtes?|sachets?|pots?|bo[iî]tes?)\b",
    re.IGNORECASE,
)
# Matches bare 'g'/'l' as units when preceded by a digit (e.g. "30g", "1l")
_UNIT_SUFFIX_RE = re.compile(r"\d\s*(?:g|l)\b", re.IGNORECASE)
_QTY_RE = re.compile(
    r"^\s*[\d½¼¾⅓⅔⅛-⅞½¼¾⅓⅔⅛]+[/\d\s]*"
    r"|^\s*(un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|quelques?|"
    r"une\s+pincée|un\s+peu)\b",
    re.IGNORECASE,
)
_SECTION_INGR = re.compile(r"ingr[eé]dients?", re.IGNORECASE)
_SECTION_END = re.compile(
    r"^(pr[eé]paration|instructions?|[eé]tapes?|recette\s*:|m[eé]thode|"
    r"pour\s+\d+|ustensiles?|mat[eé]riel|d[eé]roulement|mani[eè]re)",
    re.IGNORECASE,
)
_BULLET = re.compile(r"^\s*[-•*·▪▸→✓]\s*")
_NUMBEREDLINE = re.compile(r"^\s*\d+[.)]\s*")
# Same verbs without ^ anchor — used to detect instruction sentences mid-text
_VERB_IN_LINE = re.compile(
    r"\b(ajoutez?|ajouter?|m[eé]langez?|m[eé]langer?|versez?|verser?|"
    r"cuire|cuisez?|faites?|faire\s+revenir|pr[eé]chauffez?|pr[eé]chauffer?|"
    r"incorporez?|incorporer?|d[eé]posez?|d[eé]poser?|r[eé]servez?|r[eé]server?)\b",
    re.IGNORECASE,
)
_INSTRUCTION_VERB = re.compile(
    r"^(faire|faites?|ajouter?|ajoutez?|m[eé]langer?|m[eé]langez?|"
    r"mettre|mettez?|verser?|versez?|cuire|cuisez?|cuire|faire\s+revenir|"
    r"pr[eé]chauffer?|pr[eé]chauffez?|d[eé]couper?|d[eé]coupez?|trancher?|"
    r"laver?|lavez?|[eé]plucher?|[eé]pluchez?|incorporer?|incorporez?|"
    r"d[eé]poser?|d[eé]posez?|r[eé]server?|r[eé]servez?|porter?|portez?|"
    r"add|mix|stir|cook|heat|place|put|pour|chop|cut|dice|blend|whisk|combine|"
    r"serve|bake|fry|boil|simmer|season|drain|rinse|peel)\b",
    re.IGNORECASE,
)


_YOUTUBE_HOSTS = {"youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"}
_INSTAGRAM_HOSTS = {"instagram.com", "www.instagram.com"}
_TIKTOK_HOSTS = {"tiktok.com", "www.tiktok.com", "vm.tiktok.com", "m.tiktok.com"}

_VALID_CATEGORIES = frozenset({
    "pomme_de_terre", "riz", "pates", "entree", "autre", "sucree", "africain",
})
_MAX_EXTRACT_TEXT_LEN = 50_000


def _safe_host(url: str) -> str:
    """Returns the lowercase hostname for http(s) URLs, or '' if invalid/unsafe."""
    try:
        parsed = urllib.parse.urlparse(url)
    except ValueError:
        return ""
    if parsed.scheme not in ("http", "https"):
        return ""
    return (parsed.hostname or "").lower()


def _detect_source(url: str) -> str:
    # Exact hostname match only — a substring check (e.g. "youtube.com" in url)
    # would let an attacker craft a URL like http://evil.com/?x=youtube.com
    # and trigger a server-side request (SSRF) to an arbitrary host.
    host = _safe_host(url)
    if host in _YOUTUBE_HOSTS:
        return "youtube"
    if host in _INSTAGRAM_HOSTS:
        return "instagram"
    if host in _TIKTOK_HOSTS:
        return "tiktok"
    return "unknown"


_ALLOWED_FETCH_HOSTS = _YOUTUBE_HOSTS | _INSTAGRAM_HOSTS | _TIKTOK_HOSTS
_MAX_FETCH_BYTES = 2_000_000  # 2 Mo


def _fetch_checked(req: urllib.request.Request, timeout: int) -> bytes:
    """Fetch avec revalidation de l'hôte final (urlopen suit les redirections,
    qui pourraient quitter la whitelist → SSRF) et taille de lecture plafonnée
    (anti-DoS mémoire)."""
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        final_host = _safe_host(resp.geturl())
        if final_host not in _ALLOWED_FETCH_HOSTS:
            raise ValueError(f"Redirection vers un hôte non autorisé: {final_host}")
        return resp.read(_MAX_FETCH_BYTES)


def _og_first(patterns, html):
    for p in patterns:
        m = p.search(html)
        if m:
            return _unescape_html(m.group(1))
    return None


def _fetch_tiktok_data(url: str) -> tuple[Optional[str], Optional[str], Optional[str], Optional[str]]:
    """Returns (title, author, thumbnail_url, description)."""
    title: Optional[str] = None
    author: Optional[str] = None
    thumbnail: Optional[str] = None
    description: Optional[str] = None

    try:
        encoded = urllib.parse.quote(url, safe="")
        req = urllib.request.Request(
            TIKTOK_OEMBED.format(url=encoded),
            headers={"User-Agent": "MenusFamille/1.0"},
        )
        data = json.loads(_fetch_checked(req, timeout=5))
        title = data.get("title")
        author = data.get("author_name")
        thumbnail = data.get("thumbnail_url")
    except Exception:
        pass

    try:
        req = urllib.request.Request(url, headers={"User-Agent": _IG_UA})
        html = _fetch_checked(req, timeout=8).decode("utf-8", errors="ignore")
        if not title:
            title = _og_first([_OG_TITLE, _OG_TITLE2], html)
        if not thumbnail:
            thumbnail = _og_first([_OG_IMAGE, _OG_IMAGE2], html)
        description = _og_first([_OG_DESC, _OG_DESC2], html)
        if description:
            description = description.replace("&#10;", "\n").replace("\\n", "\n")
        # Try to find the full caption from JSON data embedded in the page
        long_text = _find_long_text_in_html(html)
        if long_text and len(long_text) > len(description or ""):
            description = long_text
    except Exception:
        pass

    return title, author, thumbnail, description


def _fetch_youtube_data(url: str) -> tuple[Optional[str], Optional[str], Optional[str], Optional[str]]:
    """Returns (title, author, thumbnail_url, description)."""
    title: Optional[str] = None
    author: Optional[str] = None
    thumbnail: Optional[str] = None
    try:
        encoded = urllib.parse.quote(url, safe="")
        req = urllib.request.Request(
            YOUTUBE_OEMBED.format(url=encoded),
            headers={"User-Agent": "MenusFamille/1.0"},
        )
        data = json.loads(_fetch_checked(req, timeout=5))
        title = data.get("title")
        author = data.get("author_name")
        thumbnail = data.get("thumbnail_url")
    except Exception:
        pass
    description = _fetch_youtube_description(url)
    return title, author, thumbnail, description


def _decode_json_str(s: str) -> str:
    """Safely decode a JSON-encoded string body (without outer quotes)."""
    try:
        return json.loads('"' + s + '"')
    except Exception:
        return s.replace("\\n", "\n").replace('\\"', '"').replace("\\\\", "\\")


def _find_long_text_in_html(html: str, min_len: int = 40) -> Optional[str]:
    """Search for the longest text-like JSON string in page HTML (for captions)."""
    best = ""
    # Common patterns for caption fields in Instagram/TikTok HTML
    patterns = [
        r'"edge_media_to_caption"\s*:\s*\{"edges"\s*:\s*\[\{"node"\s*:\s*\{"text"\s*:\s*"((?:[^"\\]|\\.)+)"',
        r'"caption"\s*:\s*\{"text"\s*:\s*"((?:[^"\\]|\\.)+)"',
        r'"accessibilityCaption"\s*:\s*"((?:[^"\\]|\\.){' + str(min_len) + r',})"',
        r'"text"\s*:\s*"((?:[^"\\]|\\.){' + str(min_len) + r',})"',
    ]
    for pattern in patterns:
        for m in re.finditer(pattern, html):
            candidate = _decode_json_str(m.group(1))
            if (
                len(candidate) > len(best)
                and not candidate.startswith("http")
                and len(candidate) < 15000
                and ("\n" in candidate or len(candidate) > 100)
            ):
                best = candidate
        if best:
            break
    return best or None


def _fetch_instagram_data(url: str) -> tuple[Optional[str], Optional[str], Optional[str], Optional[str]]:
    """Returns (title, author, thumbnail_url, description)."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": _IG_UA})
        html = _fetch_checked(req, timeout=8).decode("utf-8", errors="ignore")

        title = _og_first([_OG_TITLE, _OG_TITLE2], html)
        description = _og_first([_OG_DESC, _OG_DESC2], html)
        thumbnail = _og_first([_OG_IMAGE, _OG_IMAGE2], html)

        if description:
            description = description.replace("&#10;", "\n").replace("\\n", "\n")

        # Try to find the full caption from JSON data embedded in the page
        long_text = _find_long_text_in_html(html)
        if long_text and len(long_text) > len(description or ""):
            description = long_text

        author: Optional[str] = None
        if title:
            m = _IG_AUTHOR.match(title)
            if m:
                author = m.group(1).strip()

        return title, author, thumbnail, description
    except Exception:
        return None, None, None, None


def _unescape_html(text: str) -> str:
    # NFC normalization converts decomposed accents (e + &#x301; → é) to precomposed form
    # so regex character classes like [eé] match correctly
    return unicodedata.normalize("NFC", _html.unescape(text))


def _fetch_youtube_description(url: str) -> Optional[str]:
    """Fetch YouTube page and extract shortDescription from embedded JSON."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": _YT_UA})
        html = _fetch_checked(req, timeout=8).decode("utf-8", errors="ignore")

        # shortDescription is reliably embedded as a JSON string in the page
        match = re.search(r'"shortDescription":"((?:[^"\\]|\\.)*)"', html)
        if match:
            raw = match.group(1)
            return (
                raw.replace("\\n", "\n")
                .replace("\\t", "\t")
                .replace('\\"', '"')
                .replace("\\\\", "\\")
            )
    except Exception:
        pass
    return None


_IG_INTRO = re.compile(
    r"^[\d,]+\s+likes?,\s*[\d,]+\s+comments?\s*-\s*.+?on\s+\w+\s+\d{1,2},\s+\d{4}\s*:\s*[\"']?\s*",
    re.IGNORECASE | re.DOTALL,
)


def _strip_source_prefix(description: str) -> str:
    """Remove Instagram-style 'X likes, Y comments - user on date: ' prefix."""
    m = _IG_INTRO.match(description)
    if m:
        return description[m.end():]
    return description


def _extract_ingredients(description: str) -> list[str]:
    """Heuristically extract ingredient lines from a recipe description."""
    if not description:
        return []

    lines = description.splitlines()
    results: list[str] = []
    in_section = False

    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue

        # Entering an ingredients section
        if _SECTION_INGR.search(stripped):
            in_section = True
            continue

        # Leaving an ingredients section
        if in_section and _SECTION_END.match(stripped):
            in_section = False

        if len(stripped) > 120:
            continue  # Instructions are long; ingredients are short

        is_ingredient = False
        if _QTY_RE.search(stripped):
            is_ingredient = True
        elif _UNIT_RE.search(stripped) or _UNIT_SUFFIX_RE.search(stripped):
            is_ingredient = True
        elif in_section and len(stripped) < 80:
            is_ingredient = True

        if is_ingredient:
            clean = _BULLET.sub("", stripped)
            clean = _NUMBEREDLINE.sub("", clean).strip()
            # Outside a section: also reject if an instruction verb appears anywhere in the line
            has_verb = (
                _VERB_IN_LINE.search(clean) if not in_section
                else _INSTRUCTION_VERB.match(clean)
            )
            if clean and len(clean) > 2 and not has_verb:
                results.append(clean)

    # Deduplicate while preserving order
    seen: set[str] = set()
    unique = []
    for r in results:
        key = r.lower()
        if key not in seen:
            seen.add(key)
            unique.append(r)

    return unique[:35]


_SECTION_PREP = re.compile(
    r"^(pr[eé]paration|instructions?|[eé]tapes?|recette\s*:|m[eé]thode|"
    r"d[eé]roulement|mani[eè]re\s*de\s*faire|steps?|directions?)\s*:?\s*$",
    re.IGNORECASE,
)


def _extract_steps(description: str) -> list[str]:
    """Heuristically extract preparation steps from a recipe description."""
    if not description:
        return []

    lines = description.splitlines()
    results: list[str] = []
    in_section = False

    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue

        # Entering a preparation section
        if _SECTION_PREP.match(stripped):
            in_section = True
            continue

        # Stop at common end-of-recipe markers (comments, hashtags, sign-offs)
        if in_section and re.match(
            r"^(notes?|astuces?|conseils?|source|cr[eé]dits?|tags?|#"
            r"|\bbon\s+app[eé]tit\b|vous\s+allez|j'ai\s+pu|tr[eè]s\s+bon|"
            r"jusqu'[àa]\s+[eé]puisement|r[eé]galez)",
            stripped, re.IGNORECASE
        ):
            break

        is_step = False
        if in_section:
            is_step = True
        elif _INSTRUCTION_VERB.match(_BULLET.sub("", _NUMBEREDLINE.sub("", stripped))):
            # Numbered/bulleted instruction lines even outside a section
            is_step = bool(_NUMBEREDLINE.match(stripped) or _BULLET.match(stripped))

        if is_step and 4 < len(stripped) <= 300:
            clean = _BULLET.sub("", stripped)
            clean = _NUMBEREDLINE.sub("", clean).strip()
            if clean:
                results.append(clean)

    # Deduplicate
    seen: set[str] = set()
    unique = []
    for r in results:
        if r.lower() not in seen:
            seen.add(r.lower())
            unique.append(r)

    return unique[:30]


# ── Schemas ──────────────────────────────────────────────────────────────────

class ImportRequest(BaseModel):
    url: str = Field(max_length=2048)


class ImportResult(BaseModel):
    title: str
    source: str
    source_tag: Optional[str]
    url: str
    description: str
    suggested_ingredients: list[str]
    suggested_steps: list[str]
    thumbnail_url: Optional[str] = None
    author: Optional[str] = None


class SaveImportRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    category: str
    url: str = Field(max_length=2048)
    source_tag: Optional[str] = Field(default=None, max_length=20)
    shopping_items: list[str] = Field(default=[], max_length=100)
    ingredients: list[str] = Field(default=[], max_length=50)
    instructions: list[str] = Field(default=[], max_length=30)
    iso_year: int
    iso_week: int
    thumbnail_url: Optional[str] = Field(default=None, max_length=2048)
    author: Optional[str] = Field(default=None, max_length=200)


class SaveImportResult(BaseModel):
    dish_id: int
    dish_name: str
    items_added: int


class ExtractTextRequest(BaseModel):
    text: str


class ExtractTextResult(BaseModel):
    ingredients: list[str]
    steps: list[str]


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/import-url", response_model=ImportResult)
def import_url_endpoint(
    body: ImportRequest,
    household: Household = Depends(get_current_household),
    session: Session = Depends(get_session),
):
    url = body.url.strip()
    source = _detect_source(url)
    title: str = ""
    description: str = ""
    thumbnail_url: Optional[str] = None
    author: Optional[str] = None
    source_tag: Optional[str] = None

    if source == "youtube":
        source_tag = "insta"
        title, author, thumbnail_url, description = _fetch_youtube_data(url)
        title = title or ""
        description = description or ""
    elif source == "instagram":
        source_tag = "insta"
        title, author, thumbnail_url, description = _fetch_instagram_data(url)
        title = title or ""
        description = description or ""
    elif source == "tiktok":
        source_tag = "insta"
        title, author, thumbnail_url, description = _fetch_tiktok_data(url)
        title = title or ""
        description = description or ""

    # Strip social-media intro (e.g. "1,749 likes, 42 comments - user on Nov 2, 2020: ")
    clean_description = _strip_source_prefix(description)

    suggested_ingredients = _extract_ingredients(clean_description)
    suggested_steps = _extract_steps(clean_description)

    # Fallback: if nothing found, offer all description lines as editable candidates
    if not suggested_ingredients and not suggested_steps and clean_description.strip():
        desc_lines = [l.strip() for l in clean_description.splitlines() if 2 < len(l.strip()) < 120]
        if len(desc_lines) >= 2:
            suggested_ingredients = desc_lines[:30]

    return ImportResult(
        title=title,
        source=source,
        source_tag=source_tag,
        url=url,
        description=description,
        suggested_ingredients=suggested_ingredients,
        suggested_steps=suggested_steps,
        thumbnail_url=thumbnail_url,
        author=author,
    )


@router.post("/extract-text", response_model=ExtractTextResult)
def extract_text_endpoint(
    body: ExtractTextRequest,
    household: Household = Depends(get_current_household),
    session: Session = Depends(get_session),
):
    """Extract ingredients and steps from user-provided raw text (paste fallback)."""
    if len(body.text) > _MAX_EXTRACT_TEXT_LEN:
        raise HTTPException(status_code=413, detail="Texte trop long (50 000 caractères max.)")
    text = body.text.strip()
    ingredients = _extract_ingredients(text)
    steps = _extract_steps(text)

    # If the heuristics found nothing, fall back to all lines
    if not ingredients and not steps and text:
        lines = [l.strip() for l in text.splitlines() if 2 < len(l.strip()) < 120]
        ingredients = [l for l in lines if len(l) <= 70 and not _INSTRUCTION_VERB.match(_BULLET.sub("", _NUMBEREDLINE.sub("", l)))][:25]
        steps = [l for l in lines if len(l) > 20 and (_INSTRUCTION_VERB.match(_BULLET.sub("", _NUMBEREDLINE.sub("", l))) or _NUMBEREDLINE.match(l))][:15]
        # If still nothing classified, return all as ingredients
        if not ingredients and not steps:
            ingredients = lines[:30]

    return ExtractTextResult(ingredients=ingredients, steps=steps)


@router.post("/import-save", response_model=SaveImportResult)
def save_import(
    body: SaveImportRequest,
    household: Household = Depends(get_current_household),
    session: Session = Depends(get_session),
):
    if body.category not in _VALID_CATEGORIES:
        raise HTTPException(status_code=422, detail="Catégorie invalide")
    dish = Dish(
        household_id=household.id,
        name=body.name,
        category=body.category,
        source_tag=body.source_tag,
        seed_order=9999,
        active=True,
        ingredients=json.dumps(body.ingredients, ensure_ascii=False),
        instructions=json.dumps(body.instructions, ensure_ascii=False),
        source_url=body.url or None,
        thumbnail_url=body.thumbnail_url,
        author=body.author,
    )
    session.add(dish)
    session.commit()
    session.refresh(dish)

    items_added = 0
    if body.shopping_items:
        sl = session.exec(
            select(ShoppingList).where(
                ShoppingList.household_id == household.id,
                ShoppingList.iso_year == body.iso_year,
                ShoppingList.iso_week == body.iso_week,
            )
        ).first()
        if not sl:
            sl = ShoppingList(
                household_id=household.id,
                iso_year=body.iso_year,
                iso_week=body.iso_week,
            )
        existing = json.loads(sl.items)
        new_items = [
            {"text": t.strip(), "checked": False}
            for t in body.shopping_items
            if t.strip()
        ]
        sl.items = json.dumps(existing + new_items)
        sl.updated_at = datetime.now(timezone.utc)
        session.add(sl)
        session.commit()
        items_added = len(new_items)

    return SaveImportResult(dish_id=dish.id, dish_name=dish.name, items_added=items_added)
