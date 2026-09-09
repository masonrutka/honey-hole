#!/usr/bin/env python3
"""Pull DNR fish stocking records and join them to lakes.

Stocking history answers a question the rest of the app cannot: is this walleye
fishery naturally reproducing, or is it hatchery-maintained? That changes how
you fish it and what year classes to expect.

The catch is that the DNR's stocking system keys records by waterbody NAME and
county, not by WBIC, so joining to the lake dataset needs name matching. This
script reports its true match rate rather than silently dropping what it cannot
place -- a lake wrongly shown as "never stocked" is worse than no data at all.

Usage:
    python3 ingest/06_stocking.py                 # 2015-present
    python3 ingest/06_stocking.py --since 2005
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import wdnr  # noqa: E402

HERE = Path(__file__).parent
CACHE = HERE / "cache" / "stocking"
# The merged dataset, not the raw hydrography pull: matching needs county and
# alternate names, which only exist after 04_build_dataset.py has run.
LAKES_IN = HERE.parent / "src" / "data" / "lakes.json"
OUT = HERE / "data" / "stocking.json"

ENDPOINT = "https://apps.dnr.wi.gov/fisheriesmanagement/Public/Summary/LoadResults"
RATE_LIMIT_S = 1.5

# Suffixes the DNR abbreviates in waterbody names. Anything ending in one of
# these is flowing water, not a lake, and is expected not to match.
STREAM_SUFFIXES = {
    "BR", "CR", "CK", "RIV", "R", "BRANCH", "CREEK", "RIVER", "SPRING",
    "SPR", "FORK", "DITCH", "SLOUGH", "TRIB",
}

RE_PUNCT = re.compile(r"[^A-Z0-9 ]")
RE_SPACE = re.compile(r"\s+")

# Records that cannot match a named inland lake, by design rather than by bug.
GREAT_LAKES = {"LAKE MICHIGAN", "LAKE SUPERIOR", "MICHIGAN LAKE", "SUPERIOR LAKE"}


def classify_unmatchable(name: str) -> str | None:
    """Why a record could never match, or None if it genuinely should have."""
    n = normalize(name)
    if not n:
        return "blank name"
    if n.startswith("UNNAMED"):
        return "unnamed water"
    if n in GREAT_LAKES:
        return "Great Lakes"
    if looks_like_stream(name):
        return "stream or river"
    # "SUGAR RIVER -EAST CHANNEL", "MILL POND (UPPER)" and similar qualifiers.
    if any(w in n.split() for w in ("RIVER", "CREEK", "BROOK", "CHANNEL", "SLOUGH")):
        return "stream or river"
    return None


def normalize(name: str) -> str:
    """Fold a waterbody name to a comparable key."""
    n = RE_PUNCT.sub(" ", (name or "").upper())
    n = RE_SPACE.sub(" ", n).strip()
    # "LAKE WINNEBAGO" and "WINNEBAGO LAKE" are the same water.
    if n.startswith("LAKE "):
        n = n[5:] + " LAKE"
    return n


def looks_like_stream(name: str) -> bool:
    parts = normalize(name).split()
    return bool(parts) and parts[-1] in STREAM_SUFFIXES


def fetch_year(year: int) -> list[dict]:
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / f"{year}.json"
    if path.exists():
        return json.loads(path.read_text())["data"]

    body = urllib.parse.urlencode({
        "draw": 1, "start": 0, "length": 20000,
        "STOCKING_YEAR": year, "SPECIES_NAME": "",
        "COUNTY_CODE": "", "STOCKED_WB_NAME": "", "LOCAL_WB_NAME": "",
    }).encode()
    req = urllib.request.Request(
        ENDPOINT, data=body,
        headers={
            "User-Agent": wdnr.USER_AGENT,
            "X-Requested-With": "XMLHttpRequest",
            "Content-Type": "application/x-www-form-urlencoded",
        },
    )
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=180, context=wdnr.SSL_CTX) as r:
                payload = json.loads(r.read().decode("utf-8"))
            path.write_text(json.dumps(payload))
            time.sleep(RATE_LIMIT_S)
            return payload["data"]
        except Exception as exc:  # noqa: BLE001
            if attempt == 2:
                print(f"  ! {year} failed: {exc}")
                return []
            time.sleep(2**attempt)
    return []


# DNR species names -> our keys. Anything unmapped is kept but not attributed
# to a species profile.
SPECIES_MAP = {
    "WALLEYE": "walleye", "MUSKELLUNGE": "musky", "NORTHERN PIKE": "northern_pike",
    "LARGEMOUTH BASS": "largemouth_bass", "SMALLMOUTH BASS": "smallmouth_bass",
    "BLUEGILL": "panfish", "BLACK CRAPPIE": "panfish", "YELLOW PERCH": "yellow_perch",
    "BROOK TROUT": "trout", "BROWN TROUT": "trout", "RAINBOW TROUT": "trout",
    "LAKE TROUT": "trout", "SPLAKE": "trout", "TIGER TROUT": "trout",
    "CHANNEL CATFISH": "catfish", "FLATHEAD CATFISH": "catfish",
    "LAKE STURGEON": "sturgeon",
}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--since", type=int, default=2015)
    ap.add_argument("--until", type=int, default=2026)
    args = ap.parse_args()

    if not LAKES_IN.exists():
        print("run 04_build_dataset.py first")
        return 1
    lakes = json.loads(LAKES_IN.read_text())

    # Index lakes by (normalised name, county). Where a county has two lakes of
    # the same name, prefer the larger -- it is the one anglers mean.
    index: dict[tuple[str, str], dict] = {}
    ambiguous = 0
    for lake in sorted(lakes, key=lambda x: -x["acres"]):
        county = (lake.get("county") or "").upper()
        for nm in [lake["name"], *lake.get("altNames", [])]:
            key = (normalize(nm), county)
            if key in index:
                if index[key]["wbic"] != lake["wbic"]:
                    ambiguous += 1
                continue
            index[key] = lake

    # Fallback index for names that are unique statewide, used when the county
    # on a stocking record does not line up (a lake spanning two counties is
    # filed under one of them, not always the one we recorded).
    by_name: dict[str, list[dict]] = defaultdict(list)
    for lake in lakes:
        for nm in [lake["name"], *lake.get("altNames", [])]:
            key = normalize(nm)
            if all(x["wbic"] != lake["wbic"] for x in by_name[key]):
                by_name[key].append(lake)

    rows: list[dict] = []
    for year in range(args.since, args.until + 1):
        data = fetch_year(year)
        if data:
            print(f"  {year}: {len(data):,} records")
        rows.extend(data)

    by_wbic: dict[int, list[dict]] = defaultdict(list)
    matched = by_county = by_unique_name = 0
    unmatchable: dict[str, int] = defaultdict(int)
    unmatched_names: dict[str, int] = defaultdict(int)
    unmatched_lakes = 0

    for r in rows:
        name = r.get("STOCKED_WB_NAME") or ""
        county = (r.get("STOCKED_COUNTY_NAME") or "").upper()

        lake = index.get((normalize(name), county))
        if lake is not None:
            by_county += 1
        else:
            # Unique statewide name is a safe fallback; an ambiguous one is not.
            candidates = by_name.get(normalize(name), [])
            if len(candidates) == 1:
                lake = candidates[0]
                by_unique_name += 1

        if lake is None:
            reason = classify_unmatchable(name)
            if reason:
                unmatchable[reason] += 1
            else:
                unmatched_lakes += 1
                unmatched_names[f"{name} ({county.title()})"] += 1
            continue

        matched += 1
        by_wbic[lake["wbic"]].append({
            "year": r.get("STOCKING_YEAR"),
            "species": (r.get("SPECIES_NAME") or "").title(),
            "speciesKey": SPECIES_MAP.get((r.get("SPECIES_NAME") or "").upper()),
            "count": r.get("SUM_FISH_STOCKED_NUMBER"),
            "ageClass": (r.get("AGE_CLASS") or "").title() or None,
            "avgLengthIn": r.get("AVERAGE_FISH_LENGTH_INCHES"),
            "source": r.get("SOURCE_TYPE"),
        })

    for wbic in by_wbic:
        by_wbic[wbic].sort(key=lambda x: (-(x["year"] or 0), x["species"]))

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({str(k): v for k, v in by_wbic.items()}, indent=2))

    total = len(rows)
    excluded = sum(unmatchable.values())
    placeable = total - excluded
    print(f"\n{total:,} stocking records {args.since}-{args.until}")
    print("  not matchable to a named inland lake, by design:")
    for reason, n in sorted(unmatchable.items(), key=lambda kv: -kv[1]):
        print(f"    {reason:<18} {n:>6,}")
    print(f"  {matched:,} matched "
          f"({by_county:,} on name+county, {by_unique_name:,} on unique name)")
    print(f"  {unmatched_lakes:,} genuinely unmatched")
    if placeable:
        print(f"\nMATCH RATE on records that should match: "
              f"{100*matched/placeable:.1f}%")
    print(f"{len(by_wbic):,} lakes have stocking history")
    if ambiguous:
        print(f"({ambiguous:,} duplicate name+county pairs; kept the larger lake)")

    if unmatched_names:
        print("\nMost common unmatched waterbodies:")
        for nm, n in sorted(unmatched_names.items(), key=lambda kv: -kv[1])[:12]:
            print(f"  {nm:<44} {n:>4} records")
    print(f"\nwrote {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
