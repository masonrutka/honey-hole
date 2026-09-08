#!/usr/bin/env python3
"""Pull per-species fishing regulations for Wisconsin lakes.

The DNR stores these as one very wide row per waterbody -- 32 species columns,
mostly null. We unpivot that into tidy (wbic, species_group, regulation) rows.

Cross-reference cells ("See Panfish.") are pointers rather than regulations, so
they are resolved to the row they point at and then dropped.

Usage:  python3 ingest/03_regulations.py
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import wdnr  # noqa: E402

OUT = Path(__file__).parent / "data" / "regulations.json"

NON_SPECIES = {"ID", "WBIC", "WATERBODY_NAME", "SHAPE", "SHAPE.AREA", "SHAPE.LEN"}

# "See Panfish." / "See Walleye, Sauger, and Hybrids." -> a pointer, not a rule.
RE_SEE = re.compile(r"^\s*see\s+(.+?)\.?\s*$", re.I)
RE_REFER = re.compile(r"^\s*please refer to", re.I)


def label(column: str) -> str:
    """PANFISH -> Panfish; WALLEYE_SAUGER_AND_HYBRIDS -> Walleye, Sauger and Hybrids."""
    words = column.replace("_", " ").title().split()
    out = " ".join(words)
    return out.replace(" And ", " and ").replace(" Or ", " or ")


def main() -> int:
    total = wdnr.count(wdnr.LAKE_REGULATIONS, "1=1")
    print(f"DNR reports {total:,} regulation polygons")

    by_wbic: dict[int, dict] = {}
    rows = pointers = skipped_no_wbic = 0
    seen = 0

    for feat in wdnr.query_all(wdnr.LAKE_REGULATIONS, "1=1", out_fields="*"):
        seen += 1
        if seen % 2000 == 0:
            print(f"  ...{seen:,}/{total:,}")

        attrs = feat["attributes"]
        wbic = attrs.get("WBIC")
        # This layer types WBIC as a float; the hydro layer types it as an
        # integer. Normalise or the two datasets will never join.
        wbic = int(wbic) if wbic else None
        if not wbic:
            # Great Lakes and boundary waters carry no WBIC; they have their own
            # regulation pamphlets and are out of scope for lake pages.
            skipped_no_wbic += 1
            continue

        rec = by_wbic.setdefault(
            wbic,
            {
                "wbic": wbic,
                "name": (attrs.get("WATERBODY_NAME") or "").strip() or None,
                "regulations": [],
            },
        )
        have = {r["species_group"] for r in rec["regulations"]}

        for col, value in attrs.items():
            if col in NON_SPECIES or not isinstance(value, str):
                continue
            text = value.strip()
            if not text or RE_REFER.match(text):
                continue
            group = label(col)
            if group in have:
                continue
            if RE_SEE.match(text):
                pointers += 1
                continue
            rec["regulations"].append({"species_group": group, "regulation": text})
            have.add(group)
            rows += 1

    out = [r for r in by_wbic.values() if r["regulations"]]
    out.sort(key=lambda r: r["wbic"])
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, indent=2))

    print(f"\n{seen:,} polygons -> {len(out):,} waterbodies with regulations")
    print(f"{rows:,} regulation rows | {pointers:,} cross-references dropped | "
          f"{skipped_no_wbic:,} without WBIC")
    print(f"wrote {OUT}")

    muskego = by_wbic.get(762400)
    if muskego:
        print(f"\nSpot-check -- {muskego['name']} (WBIC 762400):")
        for r in muskego["regulations"][:6]:
            print(f"  {r['species_group']}: {r['regulation'][:95]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
