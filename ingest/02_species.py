#!/usr/bin/env python3
"""Scrape per-lake detail from WI DNR lake pages: species, county, depth, access.

There is no API for this -- the DNR publishes it only as HTML. So we are a polite
citizen: one request per second, everything cached to disk, fully resumable.
Re-run it after an interruption and it picks up where it stopped.

All HTML parsing lives in this one file. If the DNR redesigns their pages, this
is the only thing that breaks.

Usage:
    python3 ingest/02_species.py             # largest 2000 lakes
    python3 ingest/02_species.py --limit 0   # everything (~5000, takes ~90 min)
"""
from __future__ import annotations

import argparse
import html
import json
import re
import sys
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import wdnr  # noqa: E402

HERE = Path(__file__).parent
CACHE = HERE / "cache" / "lakepages"
LAKES_IN = HERE / "data" / "lakes.json"
OUT = HERE / "data" / "lake_details.json"

URL = "https://apps.dnr.wi.gov/lakes/lakepages/LakeDetail.aspx?wbic={wbic}"
RATE_LIMIT_S = 1.0

# "<lake> is a 2194 acre lake located in Waukesha County." Big waters span
# several: "... located in Fond du Lac, Winnebago, Calumet Counties."
RE_SUMMARY = re.compile(
    r"is an?\s+([\d,]+)\s+acre\s+(\w+)\s+located in\s+(.+?)\s+Count(?:y|ies)",
    re.I,
)
RE_DEPTH = re.compile(r"maximum depth of\s+([\d,]+)\s+feet", re.I)
RE_FISH_UL = re.compile(r"<ul class='fishBullets'>(.*?)</ul>", re.I | re.S)
RE_LI = re.compile(r"<li>(.*?)</li>", re.I | re.S)
# "Largemouth Bass (Common)" -> name, abundance
RE_SPECIES = re.compile(r"^(.*?)\s*\((Abundant|Common|Present)\)$", re.I)
RE_LANDINGS = re.compile(r"Boat\s+Landings\s*\((\d+)\)", re.I)
RE_TITLE_H2 = re.compile(r"<h2[^>]*>\s*([^<]+?)\s*</h2>", re.I)


def strip_tags(fragment: str) -> str:
    text = re.sub(r"(?is)<(script|style).*?</\1>", " ", fragment)
    text = html.unescape(re.sub(r"(?s)<[^>]+>", " ", text))
    return re.sub(r"\s+", " ", text).strip()


def fetch(wbic: int) -> str | None:
    """Return page HTML, from disk cache when present."""
    path = CACHE / f"{wbic}.html"
    if path.exists():
        return path.read_text(encoding="utf-8", errors="replace")

    req = urllib.request.Request(
        URL.format(wbic=wbic), headers={"User-Agent": wdnr.USER_AGENT}
    )
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=60, context=wdnr.SSL_CTX) as resp:
                body = resp.read().decode("utf-8", errors="replace")
            path.write_text(body, encoding="utf-8")
            time.sleep(RATE_LIMIT_S)
            return body
        except Exception as exc:  # noqa: BLE001
            if attempt == 2:
                print(f"    ! {wbic} failed: {exc}")
                return None
            time.sleep(2 ** attempt)
    return None


def parse(wbic: int, page: str) -> dict:
    text = strip_tags(page)
    rec: dict = {"wbic": wbic, "species": []}

    if m := RE_SUMMARY.search(text):
        rec["acres_dnr"] = int(m.group(1).replace(",", ""))
        rec["waterbody_kind"] = m.group(2).lower()
        counties = [c.strip() for c in m.group(3).split(",") if c.strip()]
        rec["counties"] = counties
        rec["county"] = counties[0] if counties else None
    if m := RE_DEPTH.search(text):
        rec["max_depth_ft"] = int(m.group(1).replace(",", ""))
    if m := RE_LANDINGS.search(text):
        rec["boat_landings"] = int(m.group(1))

    # The <h2> carries the official DNR name, which is often more complete than
    # the hydro layer's ("Big Muskego Lake" vs "Muskego Lake").
    if m := RE_TITLE_H2.search(page):
        title = html.unescape(m.group(1)).strip()
        if title and title.lower() not in ("lakes", "wisconsin lakes"):
            rec["official_name"] = title

    if m := RE_FISH_UL.search(page):
        for li in RE_LI.findall(m.group(1)):
            entry = strip_tags(li)
            if not entry:
                continue
            sm = RE_SPECIES.match(entry)
            if sm:
                rec["species"].append(
                    {"name": sm.group(1).strip(), "abundance": sm.group(2).title()}
                )
            else:
                rec["species"].append({"name": entry, "abundance": None})

    rec["has_contour_map"] = "Contour" in text
    return rec


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=2000,
                    help="how many lakes, largest first (0 = all)")
    ap.add_argument("--from-cache", action="store_true",
                    help="parse only already-cached pages; never fetch. Use this "
                         "to re-parse after changing the parser, or to build a "
                         "partial dataset while a scrape is still running.")
    args = ap.parse_args()

    if not LAKES_IN.exists():
        print("run 01_lakes.py first"); return 1

    CACHE.mkdir(parents=True, exist_ok=True)
    lakes = json.loads(LAKES_IN.read_text())  # already sorted largest-first
    if args.limit:
        lakes = lakes[: args.limit]

    results, no_species, skipped = [], 0, 0
    for i, lake in enumerate(lakes, 1):
        if args.from_cache:
            path = CACHE / f"{lake['wbic']}.html"
            if not path.exists():
                skipped += 1
                continue
            page = path.read_text(encoding="utf-8", errors="replace")
        else:
            page = fetch(lake["wbic"])
        if page is None:
            continue
        rec = parse(lake["wbic"], page)
        if not rec["species"]:
            no_species += 1
        results.append(rec)

        if not args.from_cache and (i % 100 == 0 or i == len(lakes)):
            got = sum(len(r["species"]) for r in results)
            print(f"  {i:,}/{len(lakes):,} lakes | {got:,} species rows | "
                  f"{no_species:,} with none")

    OUT.write_text(json.dumps(results, indent=2))
    if skipped:
        print(f"skipped {skipped:,} lakes with no cached page")

    species_counts: dict[str, int] = {}
    for r in results:
        for s in r["species"]:
            species_counts[s["name"]] = species_counts.get(s["name"], 0) + 1

    print(f"\nwrote {OUT}")
    print(f"{len(results):,} lakes, "
          f"{sum(len(r['species']) for r in results):,} species rows")
    print(f"{sum(1 for r in results if r.get('county')):,} with county, "
          f"{sum(1 for r in results if r.get('max_depth_ft')):,} with max depth")
    print("\nMost common species:")
    for name, n in sorted(species_counts.items(), key=lambda kv: -kv[1])[:12]:
        print(f"  {name:<26} {n:>5,} lakes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
