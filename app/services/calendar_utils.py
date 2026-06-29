from datetime import date, timedelta


def iso_week_of(d: date) -> tuple[int, int]:
    iso = d.isocalendar()
    return iso[0], iso[1]


def month_grid(year: int, month: int) -> list[list[int]]:
    """Return a list of weeks (Mon-Sun). 0 = empty cell."""
    first = date(year, month, 1)
    # weekday() : 0=Mon ... 6=Sun
    start = first - timedelta(days=first.weekday())
    weeks: list[list[int]] = []
    current = start
    while True:
        week = []
        for _ in range(7):
            if current.month == month:
                week.append(current.day)
            else:
                week.append(0)
            current += timedelta(days=1)
        weeks.append(week)
        if current.month != month and current.weekday() == 0:
            break
        if current.month > month or (current.year > year):
            break
    return weeks


def category_for_date(d: date, weekday_category_map: dict[str, str]) -> str:
    weekday_str = str(d.weekday())
    default = {
        "0": "pomme_de_terre",
        "1": "riz",
        "2": "pates",
        "3": "pomme_de_terre",
        "4": "riz",
        "5": "autre",
        "6": "africain",
    }
    mapping = weekday_category_map if weekday_category_map else default
    return mapping.get(weekday_str, default.get(weekday_str, "autre"))
