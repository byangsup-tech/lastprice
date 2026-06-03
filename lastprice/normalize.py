"""Turn a raw marketplace card title into a canonical :class:`CardKey`.

This is the heart of cross-market matching: "Charizard - 4/102 - Base Set -
PSA 10" on Collector Crypt and the same card on Phygitals / a price API must
normalize to the same key. The parser is heuristic and intentionally easy to
extend (add sets to ``KNOWN_SETS``, graders to ``GRADERS``).
"""
from __future__ import annotations

import re

from .models import CardKey

GRADERS = ["PSA", "BGS", "CGC", "SGC", "ACE", "TAG"]

_GRADE_RE = re.compile(r"\b(" + "|".join(GRADERS) + r")\s*([0-9]{1,2}(?:\.5)?)\b", re.I)
_NUMBER_RE = re.compile(r"\b(\d{1,3})\s*/\s*(\d{1,3})\b")  # e.g. 4/102
_ALT_NUMBER_RE = re.compile(r"#\s*([A-Za-z]*\d+[A-Za-z]*)")  # e.g. #SV49

# Map common set keywords (lowercase) -> canonical set name.
KNOWN_SETS = {
    "base set": "Base Set",
    "jungle": "Jungle",
    "fossil": "Fossil",
    "team rocket": "Team Rocket",
    "neo genesis": "Neo Genesis",
    "gym heroes": "Gym Heroes",
    "evolving skies": "Evolving Skies",
    "crown zenith": "Crown Zenith",
    "hidden fates": "Hidden Fates",
    "shining fates": "Shining Fates",
    "151": "151",
    "obsidian flames": "Obsidian Flames",
    "paldea evolved": "Paldea Evolved",
    "surging sparks": "Surging Sparks",
    "prismatic evolutions": "Prismatic Evolutions",
}

_NOISE_RE = re.compile(
    r"\b(holo|holographic|1st\s*edition|first\s*edition|shadowless|reverse|"
    r"foil|promo|rare|graded|gem\s*mint|mint)\b",
    re.I,
)


def _detect_set(low: str) -> str:
    # Prefer the longest matching keyword so "base set" wins over "base".
    for kw in sorted(KNOWN_SETS, key=len, reverse=True):
        if re.search(r"\b" + re.escape(kw) + r"\b", low):
            return KNOWN_SETS[kw]
    return ""


def _extract_name(title: str) -> str:
    seg = re.split(r"\s[-|]\s", title)[0]
    seg = _GRADE_RE.sub(" ", seg)
    seg = _NUMBER_RE.sub(" ", seg)
    seg = _ALT_NUMBER_RE.sub(" ", seg)
    for kw in sorted(KNOWN_SETS, key=len, reverse=True):
        seg = re.sub(r"\b" + re.escape(kw) + r"\b", " ", seg, flags=re.I)
    seg = _NOISE_RE.sub(" ", seg)
    seg = re.sub(r"[^A-Za-z0-9 .'-]", " ", seg)
    return " ".join(seg.split()).strip(" -.").title()


def parse_card_title(title: str) -> CardKey:
    """Parse a raw listing/price title into a :class:`CardKey`."""
    t = " ".join((title or "").split())

    grader = grade = ""
    m = _GRADE_RE.search(t)
    if m:
        grader, grade = m.group(1).upper(), m.group(2)

    number = ""
    mn = _NUMBER_RE.search(t)
    if mn:
        number = f"{int(mn.group(1))}/{int(mn.group(2))}"
    else:
        ma = _ALT_NUMBER_RE.search(t)
        if ma:
            number = ma.group(1).upper()

    set_name = _detect_set(t.lower())
    name = _extract_name(t)
    return CardKey(name=name, set_name=set_name, number=number, grader=grader, grade=grade)
