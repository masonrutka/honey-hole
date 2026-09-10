#!/usr/bin/env python3
"""Bake a real map excerpt of northern Wisconsin into the app as artwork.

Rather than scattering lakes arbitrarily, this takes an actual window of the
Northern Highland lake district -- the Minocqua and Trout Lake country of Vilas
and Oneida counties, the densest concentration of lakes in the state -- and
stores the outlines with their true coordinates. The home page then draws them
where they genuinely sit, at their true relative sizes.

Real lakes do not overlap, so no packing is needed: geography does the layout.

Stored as raw WGS84 rings so the app projects them all through one shared
bounding box, which is what makes it read as a map rather than a collage.

Usage:  python3 ingest/07_hero_shapes.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import wdnr  # noqa: E402

OUT = Path(__file__).parent.parent / "src" / "data" / "hero-shapes.json"

# The window: Vilas and Oneida counties around Minocqua and Trout Lake. Chosen
# by sweeping the state for lake density -- 263 lakes of 40 acres or more sit
# inside this box, more than anywhere else in Wisconsin.
LAT_MIN, LAT_MAX = 45.80, 46.25
LON_MIN, LON_MAX = -89.90, -89.30

# Enough lakes to read as a map, few enough to stay light.
MAX_LAKES = 55
MIN_ACRES = 55

# These draw only a few hundred pixels across in total, so simplify hard.
OFFSET = 0.0009


def main() -> int:
    app_lakes = json.loads(
        (Path(__file__).parent.parent / "src" / "data" / "lakes.json").read_text()
    )
    window = [
        l for l in app_lakes
        if LAT_MIN <= l["lat"] <= LAT_MAX
        and LON_MIN <= l["lon"] <= LON_MAX
        and l["acres"] >= MIN_ACRES
    ]
    window.sort(key=lambda l: -l["acres"])
    wanted = [l["wbic"] for l in window[:MAX_LAKES]]
    print(f"{len(window)} lakes in the window; taking the largest {len(wanted)}\n")

    shapes = []
    for wbic in wanted:
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
        if not rings or len(rings[0]) < 5:
            continue

        shapes.append({"wbic": wbic, "name": name, "rings": rings})

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(shapes, separators=(",", ":")))
    kb = OUT.stat().st_size / 1024
    pts = sum(len(s["rings"][0]) for s in shapes)
    print(f"wrote {OUT} ({kb:.1f} KB, {len(shapes)} lakes, {pts:,} points)")
    print("largest:", ", ".join(s["name"] for s in shapes[:5]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
