/**
 * Lake outlines, fetched on demand and rendered as inline SVG.
 *
 * Deliberately not a tile map. A slippy map means a library, a tile provider,
 * CSP work and a lot of weight, to show something the "Open in Maps" link
 * already covers. What is actually missing is the shape of the water -- whether
 * it is a round bowl or a maze of bays -- and that is a path element.
 *
 * Outlines are fetched per lake rather than bundled: full-detail geometry for
 * 5,028 lakes is tens of megabytes, while one simplified lake is a few KB and
 * arrives in about 0.1s.
 */

import { WATERBODIES, SQ_M_PER_ACRE } from "./wdnr";

export interface LakeShape {
  /** SVG path data covering every ring, holes included. */
  path: string;
  viewBox: string;
  /** Width of the drawn extent in miles, for the scale bar. */
  widthMiles: number;
}

/**
 * Simplification tolerance in degrees, scaled to the lake.
 *
 * A fixed tolerance either erases small lakes or leaves big ones enormous:
 * at 0.0005 a 20-acre pond collapses from 44 points to 5. Scaling by the
 * lake's own extent keeps roughly the same level of detail at any size.
 */
function toleranceFor(acres: number): number {
  const sideMeters = Math.sqrt(Math.max(1, acres) * SQ_M_PER_ACRE);
  const sideDegrees = sideMeters / 111_320;
  return Math.max(0.000005, sideDegrees / 150);
}

export type Ring = [number, number][];

export async function fetchLakeShape(
  wbic: number,
  acres: number,
  revalidateSeconds = 86_400,
): Promise<LakeShape | null> {
  const params = new URLSearchParams({
    where: `WATERBODY_WBIC=${wbic}`,
    outFields: "WATERBODY_WBIC",
    returnGeometry: "true",
    outSR: "4326",
    geometryPrecision: "5",
    maxAllowableOffset: String(toleranceFor(acres)),
    f: "json",
  });

  let data;
  try {
    const res = await fetch(`${WATERBODIES}/query?${params}`, {
      // Lake outlines change on the order of never.
      next: { revalidate: revalidateSeconds },
    });
    if (!res.ok) return null;
    data = await res.json();
  } catch {
    return null;
  }

  const rings: Ring[] = (data?.features ?? []).flatMap(
    (f: { geometry?: { rings?: Ring[] } }) => f.geometry?.rings ?? [],
  );
  if (rings.length === 0) return null;

  return shapeFromRings(rings);
}

export interface LakeOnMap {
  wbic: number;
  name: string;
  /** Path in the shared coordinate space. */
  path: string;
  /** Centre, for placing labels or sizing strokes. */
  cx: number;
  cy: number;
  /** Width of this lake in the shared space, for scaling its stroke. */
  extent: number;
}

export interface LakeMapView {
  viewBox: string;
  lakes: LakeOnMap[];
  widthMiles: number;
}

/**
 * Project many lakes through ONE bounding box, so they land where they
 * actually are relative to each other.
 *
 * shapeFromRings normalises each lake to its own box, which is right for a
 * single outline and wrong for a group: it throws away exactly the information
 * that makes a set of lakes read as a map.
 */
export function mapFromLakes(
  input: { wbic: number; name: string; rings: Ring[] }[],
  padding = 0.02,
): LakeMapView | null {
  let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const lake of input) {
    for (const ring of lake.rings) {
      for (const [lon, lat] of ring) {
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }
    }
  }
  if (!Number.isFinite(minLon) || !Number.isFinite(minLat)) return null;

  const padLon = (maxLon - minLon) * padding;
  const padLat = (maxLat - minLat) * padding;
  minLon -= padLon; maxLon += padLon;
  minLat -= padLat; maxLat += padLat;

  // Longitude degrees shrink toward the poles; without this the map is stretched.
  const midLat = (minLat + maxLat) / 2;
  const lonScale = Math.cos((midLat * Math.PI) / 180);
  const x = (lon: number) => (lon - minLon) * lonScale;
  const y = (lat: number) => maxLat - lat;

  const width = Math.max(1e-9, (maxLon - minLon) * lonScale);
  const height = Math.max(1e-9, maxLat - minLat);

  const lakes: LakeOnMap[] = [];
  for (const lake of input) {
    let lo = Infinity, hi = -Infinity, top = Infinity, bot = -Infinity;
    const parts: string[] = [];
    for (const ring of lake.rings) {
      if (ring.length < 3) continue;
      const pts = ring.map(([lon, lat]) => {
        const px = x(lon), py = y(lat);
        if (px < lo) lo = px;
        if (px > hi) hi = px;
        if (py < top) top = py;
        if (py > bot) bot = py;
        return `${px.toFixed(6)},${py.toFixed(6)}`;
      });
      parts.push(`M${pts.join("L")}Z`);
    }
    if (parts.length === 0) continue;
    lakes.push({
      wbic: lake.wbic,
      name: lake.name,
      path: parts.join(""),
      cx: (lo + hi) / 2,
      cy: (top + bot) / 2,
      extent: Math.max(hi - lo, bot - top),
    });
  }
  if (lakes.length === 0) return null;

  const MILES_PER_DEGREE_LAT = 69.055;
  return {
    viewBox: `0 0 ${width.toFixed(6)} ${height.toFixed(6)}`,
    lakes,
    widthMiles: width * MILES_PER_DEGREE_LAT,
  };
}

/** Convert WGS84 rings into a normalised SVG path. Exported for testing. */
export function shapeFromRings(rings: Ring[]): LakeShape | null {
  let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const ring of rings) {
    for (const [lon, lat] of ring) {
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  }
  if (!Number.isFinite(minLon) || !Number.isFinite(minLat)) return null;

  // Longitude degrees shrink toward the poles. Without this correction every
  // Wisconsin lake renders about 30% too wide.
  const midLat = (minLat + maxLat) / 2;
  const lonScale = Math.cos((midLat * Math.PI) / 180);

  const x = (lon: number) => (lon - minLon) * lonScale;
  const y = (lat: number) => (maxLat - lat); // SVG y grows downward

  const width = Math.max(1e-9, (maxLon - minLon) * lonScale);
  const height = Math.max(1e-9, maxLat - minLat);

  const path = rings
    .map((ring) => {
      if (ring.length < 3) return "";
      const pts = ring.map(
        ([lon, lat]) => `${x(lon).toFixed(6)},${y(lat).toFixed(6)}`,
      );
      return `M${pts.join("L")}Z`;
    })
    .filter(Boolean)
    .join("");

  if (!path) return null;

  const MILES_PER_DEGREE_LAT = 69.055;
  return {
    path,
    viewBox: `0 0 ${width.toFixed(6)} ${height.toFixed(6)}`,
    widthMiles: (maxLon - minLon) * lonScale * MILES_PER_DEGREE_LAT,
  };
}
