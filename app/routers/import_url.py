import html as _html
import logging
import ipaddress
import json
import re
import socket
import ssl
import unicodedata
import urllib.request
import urllib.parse
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlmodel import Session, select
from pydantic import BaseModel, Field
from app.db import get_session
from app.models import Household, Dish, ShoppingList
from app.auth import check_import_quota, consume_import_quota, get_current_household, get_current_member
from app.models import Member

# Import de recettes : illimite en premium, sinon quota mensuel gratuit
router = APIRouter(prefix="/api", tags=["import"], dependencies=[Depends(check_import_quota)])
logger = logging.getLogger(__name__)

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
_BULLET = re.compile(r"^\s*[-•*·▪▸→✓]\s*")
_NUMBEREDLINE = re.compile(r"^\s*\d+[.)]\s*")
# Verbes d'instruction (fr infinitif + impératif « vous » ET « tu » + en).
# Les recettes Instagram sont très souvent en « tu » (Fais, Ajoute, Coupe…) :
# un verbe raté = une étape classée à tort en ingrédient.
_VERBS_FR = (
    # faire / mettre / battre / servir / couvrir irréguliers
    r"faire|fais|faites|mettre|mets|mettez|battre|bats|battez|"
    r"servir|sers|servez|couvrir|couvre|couvrez|"
    # -er : infinitif, impératif tu (stem+e), impératif vous (stem+ez)
    r"ajouter|ajoute|ajoutez|m[eé]langer|m[eé]lange|m[eé]langez|"
    r"verser|verse|versez|cuire|cuis|cuisez|"
    r"pr[eé]chauffer|pr[eé]chauffe|pr[eé]chauffez|d[eé]couper|d[eé]coupe|d[eé]coupez|"
    r"trancher|tranche|tranchez|laver|lave|lavez|"
    r"[eé]plucher|[eé]pluche|[eé]pluchez|incorporer|incorpore|incorporez|"
    r"d[eé]poser|d[eé]pose|d[eé]posez|r[eé]server|r[eé]serve|r[eé]servez|"
    r"porter|porte|portez|fouetter|fouette|fouettez|"
    r"enfourner|enfourne|enfournez|saupoudrer|saupoudre|saupoudrez|"
    r"laisser|laisse|laissez|remuer|remue|remuez|"
    r"[eé]goutter|[eé]goutte|[eé]gouttez|assaisonner|assaisonne|assaisonnez|"
    r"griller|grille|grillez|mijoter|mijote|mijotez|mixer|mixe|mixez|"
    r"hacher|hache|hachez|[eé]taler|[eé]tale|[eé]talez|"
    r"beurrer|beurre|beurrez|fariner|farine|farinez|"
    r"saler|sale|salez|poivrer|poivre|poivrez|"
    r"d[eé]guster|d[eé]guste|d[eé]gustez|disposer|dispose|disposez|"
    r"former|forme|formez|abaisser|abaisse|abaissez|"
    r"napper|nappe|nappez|d[eé]glacer|d[eé]glace|d[eé]glacez|"
    r"filtrer|filtre|filtrez|chauffer|chauffe|chauffez|"
    r"d[eé]mouler|d[eé]moule|d[eé]moulez|retourner|retourne|retournez|"
    r"dorer|dore|dorez|saisir|saisis|saisissez|"
    r"remettre|remets|remettez|rectifier|rectifie|rectifiez|"
    r"badigeonner|badigeonne|badigeonnez|arroser|arrose|arrosez|"
    r"parsemer|pars[eè]me|parsemez|recouvrir|recouvre|recouvrez|"
    r"terminer|termine|terminez|r[eé]partir|r[eé]partis|r[eé]partissez|"
    r"garnir|garnis|garnissez|p[eé]trir|p[eé]tris|p[eé]trissez|"
    r"r[eé]chauffer|r[eé]chauffe|r[eé]chauffez|"
    r"faire\s+revenir"
)
_VERBS_EN = (
    r"add|mix|stir|cook|heat|preheat|place|put|pour|chop|cut|dice|blend|"
    r"whisk|combine|serve|bake|fry|boil|simmer|season|drain|rinse|peel|"
    r"knead|spread|sprinkle|grease"
)
# Détection d'un verbe n'importe où dans la ligne (phrases d'instruction)
_VERB_IN_LINE = re.compile(rf"\b(?:{_VERBS_FR})\b", re.IGNORECASE)
# Ligne qui COMMENCE par un verbe d'instruction
_INSTRUCTION_VERB = re.compile(rf"^(?:{_VERBS_FR}|{_VERBS_EN})\b", re.IGNORECASE)


_YOUTUBE_HOSTS = {"youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"}
_INSTAGRAM_HOSTS = {"instagram.com", "www.instagram.com"}
_TIKTOK_HOSTS = {"tiktok.com", "www.tiktok.com", "vm.tiktok.com", "m.tiktok.com"}

_VALID_CATEGORIES = frozenset({
    "pomme_de_terre", "riz", "pates", "entree", "autre", "sucree", "africain", "apero", "sauce",
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


# ── Import générique (sites de recettes, JSON-LD schema.org/Recipe) ──────────

def _resolve_public_ip(host: str, port: int) -> Optional[tuple[int, str]]:
    """Résout l'hôte et n'accepte QUE si toutes les IP sont publiques.
    Retourne (famille, ip) à utiliser pour la connexion, ou None.

    Toutes les IP renvoyées sont validées (défense contre les réponses DNS
    mixtes public/privé) et c'est cette IP exacte qui sera connectée — pas de
    seconde résolution possible (défense contre le DNS rebinding)."""
    try:
        infos = socket.getaddrinfo(host, port, proto=socket.IPPROTO_TCP)
    except OSError:
        return None
    if not infos:
        return None
    chosen: Optional[tuple[int, str]] = None
    for family, _type, _proto, _canon, sockaddr in infos:
        ip = ipaddress.ip_address(sockaddr[0])
        if not ip.is_global:
            return None  # une seule IP non publique → tout rejeté
        if chosen is None:
            chosen = (family, sockaddr[0])
    return chosen


def _is_public_host(host: str) -> bool:
    """Conservé pour lisibilité/tests : l'hôte résout-il vers du public ?"""
    return _resolve_public_ip(host, 80) is not None


_HTTP_DEFAULT_PORTS = {"http": 80, "https": 443}


def _pinned_get(url: str, timeout: int = 8) -> Optional[tuple[int, dict, bytes]]:
    """GET épinglé sur l'IP validée : une seule résolution DNS, la connexion
    se fait sur cette IP exacte (fenêtre de DNS rebinding fermée).
    Retourne (status, headers_bas_de_casse, corps) ou None. Ne suit pas les
    redirections (gérées par l'appelant, qui re-valide chaque saut)."""
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme not in _HTTP_DEFAULT_PORTS:
        return None
    host = (parsed.hostname or "").lower()
    if not host:
        return None
    port = parsed.port or _HTTP_DEFAULT_PORTS[parsed.scheme]
    resolved = _resolve_public_ip(host, port)
    if not resolved:
        return None
    family, ip = resolved

    path = parsed.path or "/"
    if parsed.query:
        path += "?" + parsed.query
    # HTTP/1.0 + Connection: close → pas de chunked ; identity → pas de gzip
    request = (
        f"GET {path} HTTP/1.0\r\n"
        f"Host: {host}\r\n"
        f"User-Agent: {_YT_UA}\r\n"
        f"Accept: text/html\r\n"
        f"Accept-Encoding: identity\r\n"
        f"Connection: close\r\n\r\n"
    ).encode("ascii", errors="ignore")

    sock = None
    try:
        sock = socket.socket(family, socket.SOCK_STREAM)
        sock.settimeout(timeout)
        sock.connect((ip, port))
        if parsed.scheme == "https":
            ctx = ssl.create_default_context()
            sock = ctx.wrap_socket(sock, server_hostname=host)  # SNI + vérif cert sur host
        sock.sendall(request)

        raw = bytearray()
        while len(raw) <= _MAX_FETCH_BYTES:
            chunk = sock.recv(65536)
            if not chunk:
                break
            raw.extend(chunk)
    except (OSError, ssl.SSLError):
        return None
    finally:
        if sock is not None:
            try:
                sock.close()
            except OSError:
                pass

    sep = raw.find(b"\r\n\r\n")
    if sep == -1:
        return None
    head = raw[:sep].decode("iso-8859-1", errors="ignore")
    body = bytes(raw[sep + 4:])
    lines = head.split("\r\n")
    try:
        status = int(lines[0].split(" ", 2)[1])
    except (IndexError, ValueError):
        return None
    headers: dict[str, str] = {}
    for ln in lines[1:]:
        if ":" in ln:
            k, v = ln.split(":", 1)
            headers[k.strip().lower()] = v.strip()
    return status, headers, body


def _fetch_public_html(url: str, max_redirects: int = 3) -> Optional[str]:
    """Récupère une page publique : IP épinglée, schéma et hôte validés à
    chaque redirection, taille plafonnée."""
    for _ in range(max_redirects + 1):
        result = _pinned_get(url)
        if result is None:
            return None
        status, headers, body = result
        if status in (301, 302, 303, 307, 308):
            location = headers.get("location")
            if not location:
                return None
            url = urllib.parse.urljoin(url, location)
            continue
        if status != 200:
            return None
        return body.decode("utf-8", errors="ignore")
    return None


# Certains sites (Marmiton…) encodent l'attribut en entités HTML :
# type="application&#x2F;ld&#x2B;json" — on accepte / + et leurs entités.
_JSONLD_RE = re.compile(
    r'<script[^>]+type=["\']application(?:/|&#x2f;)ld(?:\+|&#x2b;)json["\'][^>]*>(.*?)</script>',
    re.IGNORECASE | re.DOTALL,
)


def _jsonld_nodes(data) -> list[dict]:
    """Aplati un document JSON-LD (dict, liste, @graph) en liste de nœuds."""
    nodes: list[dict] = []
    if isinstance(data, list):
        for item in data:
            nodes.extend(_jsonld_nodes(item))
    elif isinstance(data, dict):
        nodes.append(data)
        graph = data.get("@graph")
        if isinstance(graph, list):
            nodes.extend(_jsonld_nodes(graph))
    return nodes


def _is_recipe_node(node: dict) -> bool:
    t = node.get("@type", "")
    if isinstance(t, list):
        return "Recipe" in t
    return t == "Recipe"


def _first_str(value) -> Optional[str]:
    """Extrait une chaîne d'une valeur JSON-LD polymorphe (str, liste, dict)."""
    if isinstance(value, str):
        return value.strip() or None
    if isinstance(value, list) and value:
        return _first_str(value[0])
    if isinstance(value, dict):
        return _first_str(value.get("url") or value.get("name"))
    return None


def _instruction_steps(value) -> list[str]:
    """recipeInstructions : str | [str] | [HowToStep] | [HowToSection]."""
    steps: list[str] = []
    if isinstance(value, str):
        steps = [s.strip() for s in value.splitlines() if s.strip()]
    elif isinstance(value, list):
        for item in value:
            if isinstance(item, str):
                if item.strip():
                    steps.append(item.strip())
            elif isinstance(item, dict):
                itype = item.get("@type", "")
                if itype == "HowToSection":
                    steps.extend(_instruction_steps(item.get("itemListElement")))
                else:  # HowToStep ou objet libre
                    text = item.get("text") or item.get("name")
                    if isinstance(text, str) and text.strip():
                        steps.append(text.strip())
    return steps


def _parse_recipe_jsonld(html: str) -> Optional[dict]:
    """Cherche un nœud schema.org/Recipe dans les blocs JSON-LD de la page."""
    for m in _JSONLD_RE.finditer(html):
        try:
            data = json.loads(m.group(1))
        except Exception:
            continue
        for node in _jsonld_nodes(data):
            if not _is_recipe_node(node):
                continue
            ingredients = node.get("recipeIngredient") or node.get("ingredients") or []
            if isinstance(ingredients, str):
                ingredients = [ingredients]
            ingredients = [
                unicodedata.normalize("NFC", _html.unescape(i)).strip()
                for i in ingredients if isinstance(i, str) and i.strip()
            ]
            steps = [
                unicodedata.normalize("NFC", _html.unescape(s))
                for s in _instruction_steps(node.get("recipeInstructions"))
            ]
            return {
                "title": _first_str(node.get("name")) or "",
                "author": _first_str(node.get("author")),
                "thumbnail": _first_str(node.get("image")),
                "description": _first_str(node.get("description")) or "",
                "ingredients": ingredients,
                "steps": steps,
            }
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


# Compteurs type "164K", "1.2M", "1,749" — le suffixe K/M cassait l'ancienne
# regex et laissait passer tout le préfixe comme premier « ingrédient ».
_IG_INTRO = re.compile(
    r"^[\d.,]+\s*[KM]?\s+likes?,\s*[\d.,]+\s*[KM]?\s+comments?\s*[-–—]\s*"
    r".+?on\s+\w+\s+\d{1,2},\s+\d{4}\s*:\s*[\"'“”]?\s*",
    re.IGNORECASE | re.DOTALL,
)


def _strip_source_prefix(description: str) -> str:
    """Remove Instagram-style 'X likes, Y comments - user on date: ' prefix."""
    m = _IG_INTRO.match(description)
    if m:
        return description[m.end():]
    return description


_SECTION_PREP = re.compile(
    r"^(pr[eé]paration|instructions?|[eé]tapes?|recette\s*:|m[eé]thode|"
    r"d[eé]roulement|mani[eè]re\s*de\s*faire|steps?|directions?)\s*:?\s*$",
    re.IGNORECASE,
)
# Sections annexes dont le contenu n'est ni ingrédient ni étape
_SECTION_OTHER = re.compile(
    r"^(ustensiles?|mat[eé]riel|conservation|accompagnements?)\b", re.IGNORECASE
)
# Ligne de rendement ("Pour 4 personnes") : neutre, ne change pas de section
_YIELD_LINE = re.compile(
    r"^pour\s+\d+\s*(personnes?|parts?|portions?|pers\.?)?\s*:?\s*$", re.IGNORECASE
)
# Emoji/symboles/puces en tête de ligne, à retirer pour tester un sous-titre
_LEAD_JUNK = re.compile(r"^[\s\W_]+", re.UNICODE)
# Sous-titres de préparation ("Montage :", "Dressage", "Pour le montage")
_STEP_HEADER_KW = re.compile(
    r"(montage|assemblage|pr[eé]paration|instructions?|[eé]tapes?|m[eé]thode|"
    r"dressage|cuisson|finition|r[eé]alisation|d[eé]roulement)",
    re.IGNORECASE,
)
# Sous-titres d'ingrédients ("Pour la viande :", "Pour la béchamel", "Sauce :")
_INGR_HEADER_KW = re.compile(
    r"(ingr[eé]dients?|garniture|sauce|b[eé]chamel|p[aâ]te|cr[eè]me|marinade|"
    r"^pour\s+(la|le|les|l[’']|\d|une?|deux))",
    re.IGNORECASE,
)


# Emoji/symboles décoratifs en fin de titre ("MOUSSAKA 🍆" → "MOUSSAKA")
_TRAIL_DECO = re.compile(
    "[\\s\u2190-\u21ff\u2300-\u27bf\u2b00-\u2bff\ufe0f\u200d"
    "\u2022\u00b7\u25aa\u25b8\u2192\u2713\u2605\u2606\u00ab\u00bb\u2026"
    "\U0001F000-\U0001FAFF]+$"
)
# Intro Instagram/TikTok/YouTube : "Auteur on Instagram: ..."
_SOCIAL_TITLE_PREFIX = re.compile(
    r".*?\bon\s+(?:instagram|tiktok|youtube)\b\s*:?\s*", re.IGNORECASE | re.DOTALL
)
_TITLE_STOP = ("je ", "j'", "salut", "bonjour", "coucou", "aujourd", "voici", "voilà", "recette d")


def _clean_social_title(raw_title: str, clean_description: str) -> str:
    """Déduit un nom de plat court et lisible d'une légende de réseau social.

    Le titre OpenGraph d'Instagram est « Auteur on Instagram: <légende
    entière> » — inutilisable comme nom. On préfère la première vraie ligne
    de la légende (« ✨ MOUSSAKA 🍆 » → « Moussaka »)."""
    # 1. Première ligne « forte » de la légende (courte, pas de la prose)
    for line in clean_description.splitlines():
        s = _LEAD_JUNK.sub("", line).strip().strip("\"'“”«»")
        s = _TRAIL_DECO.sub("", s).strip()
        if not s or len(s) > 60:
            continue
        if s.lower().startswith(_TITLE_STOP):
            continue
        # Un vrai titre a peu de mots et pas de ponctuation de phrase
        if s.endswith((".", "!", "?", ":", ",")) or len(s.split()) > 8:
            continue
        return s.capitalize() if s.isupper() else s

    # 2. Repli : retirer « Auteur on Instagram: » du titre OG
    base = _SOCIAL_TITLE_PREFIX.sub("", raw_title or "", count=1)
    base = _LEAD_JUNK.sub("", base).strip().strip("\"'“”«»")
    base = base.splitlines()[0] if base else ""
    base = _TRAIL_DECO.sub("", base).strip()
    return (base[:60] or raw_title or "").strip()


def _classify_header(stripped: str) -> Optional[str]:
    """Un sous-titre de section (emoji + texte court finissant par ':' ou
    mot-clé connu) → 'ingredients' | 'steps' | None."""
    body = _LEAD_JUNK.sub("", stripped).strip()
    if not body or len(body) > 45:
        return None
    ends_colon = body.rstrip().endswith(":")
    core = body.rstrip(": ").strip()
    # On vérifie « étapes » avant « ingrédients » : « Pour le montage » = étapes
    if _STEP_HEADER_KW.search(core):
        return "steps"
    if _INGR_HEADER_KW.search(core):
        return "ingredients"
    return None if not ends_colon else "keep"
# Fin de recette : notes, hashtags, mentions, formules de conclusion
_END_MARKERS = re.compile(
    r"^(notes?\s*:|astuces?\s*:?|conseils?\s*:?|sources?\s*:|cr[eé]dits?|"
    r"tags?\s*:|[#@]|abonne|suivez|retrouvez|\bbon\s+app[eé]tit\b|r[eé]gale|"
    r"vous\s+allez|j'ai\s+pu|tr[eè]s\s+bon|jusqu'[àa]\s+[eé]puisement|"
    r"et\s+maintenant|et\s+voil[àa]|enjoy\b|musi(?:c|que))",
    re.IGNORECASE,
)


def _dedupe(values: list[str]) -> list[str]:
    seen: set[str] = set()
    unique: list[str] = []
    for v in values:
        key = v.lower()
        if key not in seen:
            seen.add(key)
            unique.append(v)
    return unique


def _extract_recipe_parts(description: str) -> tuple[list[str], list[str]]:
    """Sépare ingrédients et étapes en UNE passe avec suivi de section.

    Contrairement aux anciens extracteurs indépendants, une ligne ne peut
    atterrir que dans une seule liste — fini les instructions mélangées aux
    courses. Retourne (ingredients, steps).
    """
    if not description:
        return [], []

    ingredients: list[str] = []
    steps: list[str] = []
    section: Optional[str] = None  # None | "ingredients" | "steps" | "other"

    for line in description.splitlines():
        stripped = line.strip()
        if not stripped:
            continue

        clean = _BULLET.sub("", stripped)
        clean = _NUMBEREDLINE.sub("", clean).strip()
        if len(clean) <= 2:
            continue

        starts_with_verb = bool(_INSTRUCTION_VERB.match(clean))
        has_verb = bool(_VERB_IN_LINE.search(clean))

        # ── Fin de recette (avant tout) : hashtags, notes, formules ──
        if _END_MARKERS.match(stripped):
            if len(ingredients) + len(steps) >= 3:
                break
            continue

        # ── Rendement ("Pour 4 personnes") : neutre ──
        if _YIELD_LINE.match(stripped):
            continue

        # ── Transitions de section ──
        # Un vrai titre est court et sans verbe ("Ingrédients :", "Pour la
        # viande :", "Montage :"), pas une étape qui contient le mot
        # ("Mélangez les ingrédients secs").
        if _SECTION_PREP.match(stripped):
            section = "steps"
            continue
        if _SECTION_OTHER.match(stripped) and len(stripped) < 40 and not has_verb:
            section = "other"
            continue
        if not has_verb:
            header = _classify_header(stripped)
            if header == "steps":
                section = "steps"
                continue
            if header == "ingredients":
                section = "ingredients"
                continue
            if header == "keep":
                continue  # sous-titre inconnu : on garde la section courante
        # Fallback : mot « ingrédient » présent dans une ligne courte sans verbe
        if _SECTION_INGR.search(stripped) and len(stripped) < 40 and not has_verb:
            section = "ingredients"
            continue

        if section == "other":
            continue

        starts_with_qty = bool(_QTY_RE.match(clean))
        has_unit = bool(_UNIT_RE.search(stripped) or _UNIT_SUFFIX_RE.search(stripped))

        if section == "ingredients":
            # Dans une liste d'ingrédients, une phrase qui commence par un verbe
            # (ou une longue phrase avec verbe) est une instruction égarée.
            if starts_with_verb or (has_verb and len(clean) > 40):
                if len(clean) > 15:
                    steps.append(clean)
            elif len(stripped) <= 120:
                ingredients.append(clean)
            continue

        if section == "steps":
            if 4 < len(stripped) <= 300:
                steps.append(clean)
            continue

        # ── Hors section : heuristique, une seule destination par ligne ──
        # Étape = commence par un verbe, ou longue phrase contenant un verbe.
        if starts_with_verb or (has_verb and len(clean) > 40):
            if 4 < len(stripped) <= 300:
                steps.append(clean)
        # Ingrédient = commence par une quantité (évite la prose qui contient
        # un mot-unité au milieu, ex. « des morceaux de viande »).
        elif starts_with_qty and has_unit and len(stripped) <= 120:
            ingredients.append(clean)
        elif starts_with_qty and len(stripped) <= 80:
            ingredients.append(clean)

    return _dedupe(ingredients)[:35], _dedupe(steps)[:30]


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
    elif _safe_host(url):
        # Site de recettes générique : JSON-LD schema.org/Recipe (structuré,
        # fiable — Marmiton, 750g, la plupart des blogs), sinon balises OG
        # + heuristiques sur la description.
        html = None
        try:
            html = _fetch_public_html(url)
        except Exception:
            html = None
        if html:
            recipe = _parse_recipe_jsonld(html)
            if recipe:
                return ImportResult(
                    title=recipe["title"],
                    source="site",
                    source_tag=None,
                    url=url,
                    description=recipe["description"],
                    suggested_ingredients=recipe["ingredients"][:35],
                    suggested_steps=recipe["steps"][:30],
                    thumbnail_url=recipe["thumbnail"],
                    author=recipe["author"],
                )
            source = "site"
            title = _og_first([_OG_TITLE, _OG_TITLE2], html) or ""
            description = _og_first([_OG_DESC, _OG_DESC2], html) or ""
            thumbnail_url = _og_first([_OG_IMAGE, _OG_IMAGE2], html)

    # Strip social-media intro (e.g. "1,749 likes, 42 comments - user on Nov 2, 2020: ")
    clean_description = _strip_source_prefix(description)

    # Nom de plat lisible : le titre OG social est la légende entière
    if source in ("instagram", "tiktok", "youtube"):
        title = _clean_social_title(title, clean_description)

    suggested_ingredients, suggested_steps = _extract_recipe_parts(clean_description)

    # Fallback: if nothing found, offer all description lines as editable candidates
    if not suggested_ingredients and not suggested_steps and clean_description.strip():
        desc_lines = [ln.strip() for ln in clean_description.splitlines() if 2 < len(ln.strip()) < 120]
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
    ingredients, steps = _parse_recipe_text(text)
    return ExtractTextResult(ingredients=ingredients, steps=steps)


def _parse_recipe_text(text: str) -> tuple[list[str], list[str]]:
    """Sépare un texte brut en (ingrédients, étapes) via heuristiques, avec
    repli ligne-à-ligne si rien n'est classé."""
    ingredients, steps = _extract_recipe_parts(text)
    if not ingredients and not steps and text:
        lines = [ln.strip() for ln in text.splitlines() if 2 < len(ln.strip()) < 120]
        ingredients = [ln for ln in lines if len(ln) <= 70 and not _INSTRUCTION_VERB.match(_BULLET.sub("", _NUMBEREDLINE.sub("", ln)))][:25]
        steps = [ln for ln in lines if len(ln) > 20 and (_INSTRUCTION_VERB.match(_BULLET.sub("", _NUMBEREDLINE.sub("", ln))) or _NUMBEREDLINE.match(ln))][:15]
        if not ingredients and not steps:
            ingredients = lines[:30]
    return ingredients, steps


@router.post("/import-photo", response_model=ExtractTextResult)
async def import_photo(
    file: UploadFile = File(...),
    household: Household = Depends(get_current_household),
    session: Session = Depends(get_session),
):
    """OCR d'une photo de recette (papier, livre, magazine) → ingrédients/étapes."""
    from app.services.ocr import ocr_available, image_to_text
    if not ocr_available():
        raise HTTPException(status_code=503, detail="Import par photo indisponible sur ce serveur")
    if file.content_type not in ("image/jpeg", "image/png", "image/webp"):
        raise HTTPException(status_code=415, detail="Format d'image non supporté (JPEG, PNG ou WebP)")
    data = await file.read(6 * 1024 * 1024 + 1)
    if len(data) > 6 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Image trop volumineuse (max 6 Mo)")
    try:
        text = image_to_text(data)
    except Exception as exc:
        logger.error("import_photo OCR: %s", exc)
        raise HTTPException(status_code=422, detail="Lecture de l'image impossible")
    if not text:
        raise HTTPException(status_code=422, detail="Aucun texte lisible détecté sur la photo")
    ingredients, steps = _parse_recipe_text(text)
    return ExtractTextResult(ingredients=ingredients, steps=steps)


@router.post("/import-save", response_model=SaveImportResult)
def save_import(
    body: SaveImportRequest,
    household: Household = Depends(get_current_household),
    member: Member = Depends(get_current_member),
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
    consume_import_quota(member, session)

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
