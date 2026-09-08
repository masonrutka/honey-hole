#!/usr/bin/env python3
"""Merge the three raw pulls into the compact dataset the web app ships.

The regulations pull is 22 MB of mostly-duplicate text: 122k rows drawn from
only ~315 distinct regulation strings. Interning those strings and referencing
them by index takes the app payload under a megabyte, which matters because
Next.js loads this at request time.

Re-runnable at any point -- safe to run while 02_species.py is still scraping.

Usage:  python3 ingest/04_build_dataset.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).parent
DATA = HERE / "data"
OUT = HERE.parent / "src" / "data"

# Keep in sync with src/lib/species.ts
SPECIES_ALIASES = {
    "walleye": ["walleye"],
    "largemouth_bass": ["largemouth bass"],
    "smallmouth_bass": ["smallmouth bass"],
    "northern_pike": ["northern pike", "pike"],
    "musky": ["musky", "muskellunge", "muskie"],
    "panfish": ["panfish", "bluegill", "crappie", "crappies", "sunfish"],
    "yellow_perch": ["yellow perch", "perch"],
    "trout": ["trout", "brook trout", "brown trout", "rainbow trout", "lake trout"],
    "catfish": ["catfish", "channel catfish", "flathead catfish"],
    "sturgeon": ["sturgeon", "lake sturgeon"],
}


def match_species(name: str) -> str | None:
    n = name.strip().lower()
    for key, aliases in SPECIES_ALIASES.items():
        if n in aliases:
            return key
    for key, aliases in SPECIES_ALIASES.items():
        if any(a in n for a in aliases):
            return key
    return None


def load(name: str, default):
    path = DATA / name
    if not path.exists():
        print(f"  ! {name} missing, continuing without it")
        return default
    return json.loads(path.read_text())


def main() -> int:
    lakes = load("lakes.json", [])
    if not lakes:
        print("run 01_lakes.py first")
        return 1
    details = {d["wbic"]: d for d in load("lake_details.json", [])}
    regs = {r["wbic"]: r for r in load("regulations.json", [])}

    # --- intern regulation text ------------------------------------------
    groups: list[str] = []
    group_ix: dict[str, int] = {}
    texts: list[str] = []
    text_ix: dict[str, int] = {}
    by_wbic: dict[str, list[list[int]]] = {}

    for wbic, rec in regs.items():
        pairs = []
        for r in rec["regulations"]:
            g, t = r["species_group"], r["regulation"]
            if g not in group_ix:
                group_ix[g] = len(groups); groups.append(g)
            if t not in text_ix:
                text_ix[t] = len(texts); texts.append(t)
            pairs.append([group_ix[g], text_ix[t]])
        if pairs:
            by_wbic[str(wbic)] = pairs

    # --- merge lakes -----------------------------------------------------
    out_lakes = []
    unmatched: dict[str, int] = {}
    with_species = 0

    for lake in lakes:
        wbic = lake["wbic"]
        d = details.get(wbic, {})

        species = []
        for s in d.get("species", []):
            key = match_species(s["name"])
            if key is None:
                unmatched[s["name"]] = unmatched.get(s["name"], 0) + 1
                continue
            if not any(x["key"] == key for x in species):
                species.append({"key": key, "abundance": s.get("abundance")})
        if species:
            with_species += 1

        out_lakes.append({
            "wbic": wbic,
            # The lake page carries the fuller official name where we have it.
            "name": d.get("official_name") or lake["name"],
            "county": d.get("county"),
            "counties": d.get("counties") or ([d["county"]] if d.get("county") else []),
            "acres": lake["acres"],
            "maxDepthFt": d.get("max_depth_ft"),
            "lat": lake["lat"],
            "lon": lake["lon"],
            "kind": lake["hydrotype"],
            "boatLandings": d.get("boat_landings"),
            "hasContourMap": d.get("has_contour_map", False),
            "species": species,
            "hasRegs": str(wbic) in by_wbic,
            "dnrUrl": lake["dnr_url"],
        })

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "lakes.json").write_text(json.dumps(out_lakes, separators=(",", ":")))
    (OUT / "regulations.json").write_text(json.dumps(
        {"groups": groups, "texts": texts, "byWbic": by_wbic}, separators=(",", ":")
    ))

    lakes_mb = (OUT / "lakes.json").stat().st_size / 1e6
    regs_mb = (OUT / "regulations.json").stat().st_size / 1e6
    print(f"\n{len(out_lakes):,} lakes -> src/data/lakes.json ({lakes_mb:.2f} MB)")
    print(f"{len(by_wbic):,} lakes with regs, {len(texts)} unique texts "
          f"-> src/data/regulations.json ({regs_mb:.2f} MB)")
    print(f"{with_species:,} lakes have species data "
          f"({len(details):,} detail pages scraped so far)")

    if unmatched:
        print("\nUnmapped DNR species names (add to SPECIES_ALIASES if worth it):")
        for name, n in sorted(unmatched.items(), key=lambda kv: -kv[1])[:10]:
            print(f"  {name:<24} {n:>5,} lakes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
