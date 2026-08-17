"""Shared cell parsing for the workbook -> JSON generators.

The authoring workbooks are hand-maintained, so cells are messy in consistent
ways: Dutch number formatting, typographic minus signs, values that are prose
rather than numbers. These helpers make every generator treat them identically —
the alternative is each script drifting into its own idea of what "-1.000" means.
"""

import re
import unicodedata
from collections import OrderedDict


def rows(ws):
    """Yield sheet rows as dicts keyed by the header row, skipping blank rows."""
    it = ws.iter_rows(values_only=True)
    header = [clean(c) for c in next(it)]
    for row in it:
        if all(c is None or str(c).strip() == "" for c in row):
            continue
        yield OrderedDict(zip(header, [clean(c) for c in row]))


def clean(value):
    """Normalise a cell to str/number/None; collapse whitespace, drop empties."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return value
    text = re.sub(r"\s+", " ", str(value)).strip()
    if text in ("", "-", "—", "–"):
        return None
    return text


def slugify(value):
    ascii_text = unicodedata.normalize("NFKD", value or "").encode("ascii", "ignore").decode()
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", ascii_text.lower())).strip("-")


# The workbooks mix hyphen-minus with the typographic minus and dashes; treat
# them all as a sign, otherwise negative amounts silently invert into benefits.
SIGNS = str.maketrans({"−": "-", "–": "-", "—": "-"})

GROUPED = re.compile(r"[-+]?\d{1,3}(?:\.\d{3})+(?:,\d+)?")  # 1.430 / -4.224,60
DECIMAL_COMMA = re.compile(r"[-+]?\d+(?:,\d+)?")  # 0,5 / +92,61
DECIMAL_POINT = re.compile(r"[-+]?\d+(?:\.\d+)?")  # 4.6 / 39.88


def to_number(value):
    """Parse a Dutch-formatted amount ('-4.224,60', '€ 50.000', '30%') to a number.

    Deliberately strict: anything that is not a single unambiguous number
    ('PM', 'n.v.t.', 'needs verification', '+4,6% tot +12,3%') returns None, so
    the caller keeps the verbatim text instead of a value we invented.
    """
    if value is None or isinstance(value, (int, float)):
        return value

    text = str(value).translate(SIGNS).strip()
    if text.startswith("€"):
        text = text[1:].strip()
    percent = text.endswith("%")
    if percent:
        text = text[:-1].strip()

    if GROUPED.fullmatch(text):
        normalised = text.replace(".", "").replace(",", ".")
    elif DECIMAL_COMMA.fullmatch(text):
        normalised = text.replace(",", ".")
    elif DECIMAL_POINT.fullmatch(text):
        normalised = text
    else:
        return None

    number = float(normalised)
    if percent:
        number /= 100
    return int(number) if number == int(number) else number


def to_int(value):
    number = to_number(value)
    return int(number) if number is not None else None


def split_list(value):
    return [part.strip() for part in re.split(r"[;,]", value)] if value else []


def rounded(value, digits=2):
    """Round a derived number without dragging float noise into the JSON."""
    if value is None:
        return None
    number = round(value, digits)
    return int(number) if number == int(number) else number
