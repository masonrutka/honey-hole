#!/usr/bin/env python3
"""Bake a handful of real lake outlines into the app for use as artwork.

The lake shapes are the most distinctive thing this project owns -- actual DNR
survey geometry, not stock imagery -- but they only appear on individual lake
pages. This pulls a set of recognisable Wisconsin waters and stores their rings
so the home page can draw them.

Stored as raw WGS84 rings rather than SVG paths so the app can reuse the same
tested shapeFromRings() that renders the lake pages.

Usage:  python3 ingest/07_hero_shapes.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import wdnr  # noqa: E402

OUT = Path(__file__).parent.parent / "src" / "data" / "hero-shapes.json"

# Waters a Wisconsin angler recognises on sight, chosen for variety of outline
# rather than size alone -- a flowage, a drumlin lake, a big open basin.
WANTED = [
    131100,   # Lake Winnebago
    2294900,  # Turtle Flambeau Flowage
    1377100,  # Petenwell Lake
    2399700,  # Lake Chippewa
    808700,   # Lake Koshkonong
    805400,   # Lake Mendota
    139900,   # Lake Butte des Morts
    322800,   # Shawano Lake
    758300,   # Geneva Lake
    762400,   # Big Muskego Lake
]

# Aggressive simplification: these render a few hundred pixels wide at most.
OFFSET = 0.0006


def main() -> int:
    shapes = []
    for wbic in WANTED:
        data = wdnr._get(
            wdnr.WATERBODIES + "/query",
            {
                "where": f"WATERBODY_WBIC={wbic}",
                "outFields": "WATERBODY_WBIC,WATERBODY_NAME",
                "returnGeometry": "true",
                "outSR": 4326,
                "geometryPrecision": 4,
                "maxAllowableOffset": OFFSET,
                "f": "json",
            },
        )
        feats = data.get("features", [])
        if not feats:
            print(f"  ! {wbic}: no geometry")
            continue

        name = feats[0]["attributes"].get("WATERBODY_NAME") or str(wbic)
        rings = [r for f in feats for r in f.get("geometry", {}).get("rings", [])]
        # Keep only the dominant ring: islands add bytes but read as noise at
        # thumbnail scale.
        rings.sort(key=len, reverse=True)
        rings = rings[:1]
        if not rings or len(rings[0]) < 6:
            print(f"  ! {wbic} ({name}): too few points after simplifying")
            continue

        shapes.append({"wbic": wbic, "name": name, "rings": rings})
        print(f"  {name:<22} {len(rings[0]):>4} points")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(shapes, separators=(",", ":")))
    kb = OUT.stat().st_size / 1024
    print(f"\nwrote {OUT} ({kb:.1f} KB, {len(shapes)} lakes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
