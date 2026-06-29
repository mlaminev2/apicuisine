_KEYWORDS: dict[str, list[str]] = {
    "viande": [
        "poulet", "bœuf", "boeuf", "agneau", "veau", "dinde", "merguez",
        "haché", "hache", "steak", "côtelette", "escalope", "filet de",
        "blanc de poulet", "saucisse", "lardons", "jambon", "canard",
        "lapin", "mouton", "cordons bleus", "kebab", "kefta",
    ],
    "poisson": [
        "saumon", "thon", "poisson", "crevette", "cabillaud", "sardine",
        "dorade", "maquereau", "moule", "crabe", "calmar", "bar ",
        "sole", "tilapia", "lieu", "merlu",
    ],
    "laitiers": [
        "lait", "crème fraîche", "creme fraiche", "crème", "creme",
        "beurre", "fromage", "yaourt", "yogourt", "oeuf", "œuf",
        "gruyère", "emmental", "mozzarella", "parmesan", "ricotta",
        "camembert", "mascarpone", "philadelphia",
    ],
    "legumes": [
        "tomate", "oignon", "ail", "poivron", "carotte", "courgette",
        "aubergine", "épinard", "epinard", "brocoli", "salade", "concombre",
        "champignon", "poireau", "céleri", "celeri", "navet",
        "haricot vert", "petits pois", "artichaut", "fenouil", "radis",
        "pomme de terre", "patate",
    ],
    "fruits": [
        "pomme", "banane", "citron", "orange", "fraise", "mangue", "ananas",
        "poire", "raisin", "avocat", "kiwi", "pêche", "peche", "abricot",
        "cerise", "melon", "pastèque", "pasteque", "figue", "datte",
    ],
    "halal": [
        "ras el hanout", "cumin", "curcuma", "harissa", "tahini",
        "pois chiche", "lentille", "semoule", "couscous", "boulgour",
        "zaatar", "garam masala", "baharat", "sumac", "fenugrec",
        "colombo", "berberé", "berbere",
    ],
    "surgeles": ["surgelé", "surgele", "congelé", "congele", "glacé", "glace"],
    "epicerie": [
        "farine", "pâtes", "pates", "huile", "vinaigre", "sucre",
        "sauce tomate", "bouillon", "cannelle", "chocolat", "fécule",
        "fecule", "maïzena", "maizena", "levure", "bicarbonate",
        "cacao", "café", "cafe", "thé", "the ", "confiture", "miel",
        "concentré de tomate", "concentre", "conserve", "boîte", "boite",
        "riz ", " riz", "sel ", " sel",
    ],
    "boulangerie": [
        "pain", "baguette", "brioche", "croissant", "pain de mie", "biscottes",
    ],
    "hygiene": [
        "savon", "shampooing", "dentifrice", "lessive", "liquide vaisselle",
        "essuie-tout", "papier toilette", "sac poubelle", "gel douche",
    ],
}


def guess_type_key(text: str) -> str:
    """Return the type_key best matching this ingredient text, or 'autres'."""
    normalized = " " + text.lower().strip() + " "
    for type_key, keywords in _KEYWORDS.items():
        if any(kw in normalized for kw in keywords):
            return type_key
    return "autres"
