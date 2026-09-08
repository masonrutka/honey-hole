#!/usr/bin/env python3
"""Pull every named Wisconsin lake/reservoir from the DNR 24K Waterbody layer.

Writes ingest/data/lakes.json -- one record per WBIC with name, acreage and a
WGS84 centroid. This is the foundation table; everything else joins to it on WBIC.

Usage:  python3 ingest/01_lakes.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import wdnr  # noqa: E402

OUT = Path(__file__).parent / "data" / "lakes.json"

# Named stillwater only. Streams (602) and ditches (601) are a separate product;
# "Unnamed" covers ~131k farm ponds and backwaters nobody searches for by name.
WHERE = "HYDROTYPE IN (706,707) AND WATERBODY_NAME <> 'Unnamed'"

FIELDS = ",".join([
    "WATERBODY_WBIC",
    "WATERBODY_NAME",
    "SHAPE.AREA",
    "HYDROTYPE",
    "LANDLOCK_CODE",
    "RIVER_SYS_NAME",
])

HYDROTYPE_LABEL = {706: "Lake/Pond", 707: "Reservoir Flowage"}

# Below this, it is a pond, not a fishery worth a page.
MIN_ACRES = 5.0


def main() -> int:
    expected = wdnr.count(wdnr.WATERBODIES, WHERE)
    print(f"DNR reports {expected:,} named lake/reservoir polygons")

    # A single lake can be stored as several polygons (islands, split basins),
    # so accumulate by WBIC and keep the largest piece's centroid.
    lakes: dict[int, dict] = {}
    seen = 0

    for feat in wdnr.query_all(
        wdnr.WATERBODIES, WHERE, out_fields=FIELDS, geometry=True
    ):
        seen += 1
        if seen % 1000 == 0:
            print(f"  ...{seen:,}/{expected:,}")

        attrs = feat["attributes"]
        wbic = attrs.get("WATERBODY_WBIC")
        name = (attrs.get("WATERBODY_NAME") or "").strip()
        if not wbic or not name:
            continue

        area_m2 = attrs.get("SHAPE.AREA") or 0.0
        rings = feat.get("geometry", {}).get("rings")
        centroid = wdnr.polygon_centroid(rings) if rings else None

        rec = lakes.get(wbic)
        if rec is None:
            lakes[wbic] = {
                "wbic": wbic,
                "name": name,
                "area_m2": area_m2,
                "hydrotype": HYDROTYPE_LABEL.get(attrs.get("HYDROTYPE"), "Other"),
                "landlocked": attrs.get("LANDLOCK_CODE") == 1,
                "river_system": (attrs.get("RIVER_SYS_NAME") or "").strip() or None,
                "lon": centroid[0] if centroid else None,
                "lat": centroid[1] if centroid else None,
                "_biggest": area_m2,
            }
        else:
            rec["area_m2"] += area_m2
            # Centroid should track the dominant basin, not the last one seen.
            if area_m2 > rec["_biggest"] and centroid:
                rec["_biggest"] = area_m2
                rec["lon"], rec["lat"] = centroid

    rows = []
    for rec in lakes.values():
        rec.pop("_biggest", None)
        rec["acres"] = round(rec.pop("area_m2") / wdnr.SQ_M_PER_ACRE, 1)
        if rec["acres"] < MIN_ACRES or rec["lat"] is None:
            continue
        rec["dnr_url"] = (
            f"https://apps.dnr.wi.gov/lakes/lakepages/LakeDetail.aspx?wbic={rec['wbic']}"
        )
        rows.append(rec)

    rows.sort(key=lambda r: -r["acres"])

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(rows, indent=2))

    print(f"\n{seen:,} polygons -> {len(lakes):,} unique WBICs -> "
          f"{len(rows):,} lakes >= {MIN_ACRES} acres")
    print(f"wrote {OUT}")
    print("\nLargest 5:")
    for r in rows[:5]:
        print(f"  {r['name']:<28} {r['acres']:>10,.0f} ac  ({r['lat']:.4f}, {r['lon']:.4f})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
