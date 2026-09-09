"""Shared waterbody-name handling.

Both the dataset build and the stocking join need to decide what a lake is
called and what other spellings should still match it. Keeping that in one
place is what lets 06_stocking.py run without waiting on 04_build_dataset.py
-- the two scripts previously each consumed the other's output.
"""
from __future__ import annotations

import re

# DNR lake pages sometimes carry an internal abbreviated code as the title
# ("Wisconsin R Fl C3-Stevens Pt") rather than a readable name.
RE_DNR_CODE = re.compile(r"\b(R|Fl|Cr|Ck|Riv|Res|Pt|Br)\b|\d", re.I)

RE_PUNCT = re.compile(r"[^A-Z0-9 ]")
RE_SPACE = re.compile(r"\s+")


def pick_name(hydro_name: str, official: str | None) -> tuple[str, list[str]]:
    """Return (display name, alternate names to also match when searching).

    The official DNR name is usually better ("Big Muskego Lake" beats "Muskego
    Lake"), but not always -- and either way both spellings must stay
    searchable. Anglers search "Lake Geneva"; the DNR calls it "Geneva Lake".
    """
    alts: list[str] = []
    if not official or official == hydro_name:
        return hydro_name, alts
    if RE_DNR_CODE.search(official):
        # Internal code: keep the readable name, but still match the official one.
        return hydro_name, [official]
    return official, [hydro_name]


def normalize(name: str) -> str:
    """Fold a waterbody name to a comparable key."""
    n = RE_PUNCT.sub(" ", (name or "").upper())
    n = RE_SPACE.sub(" ", n).strip()
    # "LAKE WINNEBAGO" and "WINNEBAGO LAKE" are the same water.
    if n.startswith("LAKE "):
        n = n[5:] + " LAKE"
    return n
