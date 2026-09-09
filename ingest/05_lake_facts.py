#!/usr/bin/env python3
"""Scrape the DNR "Facts & Figures" page for bottom composition and lake type.

Bottom composition is the most actionable physical fact the DNR publishes:
rock and gravel hold crayfish and smallmouth, muck grows the weeds panfish and
largemouth live in, and sand is where most species spawn. Hydrologic lake type
(drainage / seepage / spring) is a decent proxy for fertility and stain, which
drives lure colour.

Same manners as 02_species.py: one request per second, cached to disk, fully
resumable, and re-parseable from cache without re-fetching.

Usage:
    python3 ingest/05_lake_facts.py                # all lakes
    python3 ingest/05_lake_facts.py --from-cache   # re-parse only
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
CACHE = HERE / "cache" / "lakefacts"
LAKES_IN = HERE / "data" / "lakes.json"
OUT = HERE / "data" / "lake_facts.json"

URL = "https://apps.dnr.wi.gov/lakes/lakepages/LakeDetail.aspx?wbic={wbic}&page=facts"
RATE_LIMIT_S = 1.0

# The page is a plain label/value table: <th class="tableLeft">X</th><td>Y</td>
RE_ROW = re.compile(
    r'<th[^>]*class="tableLeft"[^>]*>\s*(.*?)\s*</th>\s*<td[^>]*>\s*(.*?)\s*</td>',
    re.I | re.S,
)
RE_BOTTOM = re.compile(r"(\d+)\s*%\s*(sand|gravel|rock|muck)", re.I)


def clean(fragment: str) -> str:
    text = html.unescape(re.sub(r"(?s)<[^>]+>", " ", fragment))
    return re.sub(r"\s+", " ", text).strip()


def fetch(wbic: int) -> str | None:
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
            time.sleep(2**attempt)
    return None


def parse(wbic: int, page: str) -> dict:
    rec: dict = {"wbic": wbic}
    rows = {clean(k).lower(): clean(v) for k, v in RE_ROW.findall(page)}

    if bottom := rows.get("bottom"):
        parts = {m.group(2).lower(): int(m.group(1)) for m in RE_BOTTOM.finditer(bottom)}
        # Only keep it if the percentages actually say something.
        if parts and sum(parts.values()) > 0:
            rec["bottom"] = {k: parts.get(k, 0) for k in ("sand", "gravel", "rock", "muck")}

    if t := rows.get("hydrologic lake type"):
        rec["lake_type"] = t.strip().upper()
    if t := rows.get("waterbody type"):
        rec["waterbody_type"] = t.strip().lower()
    if r := rows.get("region"):
        rec["region"] = r.strip()
    return rec


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0, help="0 = all lakes")
    ap.add_argument("--from-cache", action="store_true",
                    help="parse only cached pages; never fetch")
    args = ap.parse_args()

    if not LAKES_IN.exists():
        print("run 01_lakes.py first")
        return 1
    CACHE.mkdir(parents=True, exist_ok=True)

    lakes = json.loads(LAKES_IN.read_text())
    if args.limit:
        lakes = lakes[: args.limit]

    results, skipped = [], 0
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
        results.append(parse(lake["wbic"], page))

        if not args.from_cache and (i % 200 == 0 or i == len(lakes)):
            got = sum(1 for r in results if r.get("bottom"))
            print(f"  {i:,}/{len(lakes):,} | {got:,} with bottom composition")

    OUT.write_text(json.dumps(results, indent=2))
    if skipped:
        print(f"skipped {skipped:,} lakes with no cached page")

    with_bottom = [r for r in results if r.get("bottom")]
    print(f"\nwrote {OUT}")
    print(f"{len(results):,} lakes | {len(with_bottom):,} with bottom composition "
          f"| {sum(1 for r in results if r.get('lake_type')):,} with lake type")

    if with_bottom:
        import collections
        dom = collections.Counter(
            max(r["bottom"], key=r["bottom"].get) for r in with_bottom
        )
        print("\nDominant bottom type:")
        for k, n in dom.most_common():
            print(f"  {k:<8} {n:>5,} lakes")
        types = collections.Counter(
            r["lake_type"] for r in results if r.get("lake_type")
        )
        print("\nHydrologic lake type:")
        for k, n in types.most_common(6):
            print(f"  {k:<12} {n:>5,} lakes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
