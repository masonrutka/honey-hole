"""Shared helpers for pulling data from Wisconsin DNR ArcGIS REST services.

Every WI DNR dataset is keyed by WBIC (Waterbody Identification Code), which is
the join key for this entire project.
"""
from __future__ import annotations

import json
import ssl
import time
import urllib.parse
import urllib.request
from typing import Any, Iterator

try:  # python.org macOS builds ship with an empty default trust store
    import certifi

    SSL_CTX: ssl.SSLContext | None = ssl.create_default_context(cafile=certifi.where())
except ImportError:  # pragma: no cover - fall back to whatever the system has
    SSL_CTX = None

USER_AGENT = "WI-Fishing-App/0.1 (hobby project; contact via github)"

# ArcGIS layers, verified live 2026-09-08
WATERBODIES = (
    "https://dnrmaps.wi.gov/arcgis/rest/services/DW_Map_Dynamic/"
    "EN_SurfaceWater_WTM_Ext_Dynamic_L16/MapServer/5"
)
LAKE_REGULATIONS = (
    "https://dnrmaps.wi.gov/arcgis2/rest/services/FM_WFF/"
    "FM_WFF_LAKE_REGULATIONS_WTM_EXT/MapServer/2"
)

# HYDROTYPE codes worth treating as fishable stillwater.
LAKE_HYDROTYPES = (706, 707)  # Lake/Pond, Reservoir Flowage

SQ_M_PER_ACRE = 4046.8564224


def _get(url: str, params: dict[str, Any], retries: int = 4) -> dict:
    """GET with retry/backoff. ArcGIS returns HTTP 200 on errors, so check the body."""
    qs = urllib.parse.urlencode(params)
    full = f"{url}?{qs}"
    last_err: Exception | None = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(full, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=120, context=SSL_CTX) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            if "error" in data:
                raise RuntimeError(f"ArcGIS error: {data['error']}")
            return data
        except Exception as exc:  # noqa: BLE001 - retry anything transient
            last_err = exc
            if attempt < retries - 1:
                time.sleep(2**attempt)
    raise RuntimeError(f"failed after {retries} attempts: {full}") from last_err


def count(layer: str, where: str) -> int:
    q = f"{layer}/query"
    return _get(q, {"where": where, "returnCountOnly": "true", "f": "json"})["count"]


def query_all(
    layer: str,
    where: str,
    out_fields: str = "*",
    geometry: bool = False,
    out_sr: int = 4326,
    page_size: int = 1000,
    precision: int = 6,
) -> Iterator[dict]:
    """Page through every feature matching `where`.

    The server caps responses at maxRecordCount (1000 here), so pagination is
    mandatory. Requesting outSR=4326 makes ArcGIS reproject Wisconsin Transverse
    Mercator to WGS84 server-side -- no pyproj needed.
    """
    offset = 0
    while True:
        params = {
            "where": where,
            "outFields": out_fields,
            "returnGeometry": "true" if geometry else "false",
            "resultOffset": offset,
            "resultRecordCount": page_size,
            "orderByFields": "OBJECTID",
            "f": "json",
        }
        if geometry:
            params["outSR"] = out_sr
            params["geometryPrecision"] = precision

        data = _get(f"{layer}/query", params)
        features = data.get("features", [])
        if not features:
            return
        yield from features
        if len(features) < page_size:
            return
        offset += len(features)


def ring_area_centroid(ring: list[list[float]]) -> tuple[float, float, float]:
    """Signed area and centroid of one polygon ring via the shoelace formula.

    Returns (abs_area, cx, cy) in the ring's own units (degrees here). Used only
    to pick the largest ring and locate it; real acreage comes from SHAPE.AREA,
    which the DNR stores in square meters.
    """
    n = len(ring)
    if n < 3:
        return 0.0, 0.0, 0.0
    a = cx = cy = 0.0
    for i in range(n - 1):
        x0, y0 = ring[i][0], ring[i][1]
        x1, y1 = ring[i + 1][0], ring[i + 1][1]
        cross = x0 * y1 - x1 * y0
        a += cross
        cx += (x0 + x1) * cross
        cy += (y0 + y1) * cross
    if a == 0:
        xs = [p[0] for p in ring]
        ys = [p[1] for p in ring]
        return 0.0, sum(xs) / n, sum(ys) / n
    a *= 0.5
    return abs(a), cx / (6 * a), cy / (6 * a)


def polygon_centroid(rings: list[list[list[float]]]) -> tuple[float, float] | None:
    """Centroid of the largest ring -- outer boundary, ignoring islands/holes."""
    best = None
    for ring in rings:
        area, cx, cy = ring_area_centroid(ring)
        if best is None or area > best[0]:
            best = (area, cx, cy)
    if best is None:
        return None
    return best[1], best[2]
