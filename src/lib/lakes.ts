/**
 * Lake data access.
 *
 * v1 ships the DNR dataset as static JSON rather than standing up a database.
 * It is read-only reference data that changes maybe once a season, so a
 * database would add cost and deployment surface without buying anything.
 * When catch logging arrives it needs real writes, auth and per-user rows --
 * that is the point to introduce Postgres, not before.
 */

import lakesData from "@/data/lakes.json";
import regsData from "@/data/regulations.json";
import { SPECIES, type SpeciesKey } from "./species";

export interface LakeSpecies {
  key: SpeciesKey;
  abundance: "Abundant" | "Common" | "Present" | null;
}

export interface Lake {
  wbic: number;
  name: string;
  county: string | null;
  counties: string[];
  acres: number;
  maxDepthFt: number | null;
  lat: number;
  lon: number;
  kind: string;
  boatLandings: number | null;
  hasContourMap: boolean;
  species: LakeSpecies[];
  hasRegs: boolean;
  dnrUrl: string;
}

export interface Regulation {
  speciesGroup: string;
  text: string;
}

const LAKES = lakesData as unknown as Lake[];

const REGS = regsData as unknown as {
  groups: string[];
  texts: string[];
  byWbic: Record<string, [number, number][]>;
};

const byWbic = new Map<number, Lake>(LAKES.map((l) => [l.wbic, l]));

export function getLake(wbic: number): Lake | undefined {
  return byWbic.get(wbic);
}

export function getRegulations(wbic: number): Regulation[] {
  const pairs = REGS.byWbic[String(wbic)];
  if (!pairs) return [];
  return pairs.map(([g, t]) => ({
    speciesGroup: REGS.groups[g],
    text: REGS.texts[t],
  }));
}

export function totalLakes(): number {
  return LAKES.length;
}

/** Lakes worth featuring on the home page: big, named, with species data. */
export function featuredLakes(limit = 12): Lake[] {
  return LAKES.filter((l) => l.species.length > 0 && l.acres > 500).slice(0, limit);
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
}

/**
 * Name search, ranked so that exact and prefix matches beat substring hits and
 * bigger water beats smaller water within a tier. 5k rows is small enough that
 * a linear scan is genuinely faster than building an index.
 */
export function searchLakes(query: string, limit = 40): Lake[] {
  const q = normalize(query);
  if (q.length < 2) return [];

  const scored: { lake: Lake; rank: number }[] = [];
  for (const lake of LAKES) {
    const name = normalize(lake.name);
    let rank: number;
    if (name === q) rank = 0;
    else if (name.startsWith(q)) rank = 1;
    else if (name.includes(q)) rank = 2;
    else if (lake.county && normalize(lake.county).startsWith(q)) rank = 3;
    else continue;
    scored.push({ lake, rank });
  }

  scored.sort((a, b) => a.rank - b.rank || b.lake.acres - a.lake.acres);
  return scored.slice(0, limit).map((s) => s.lake);
}

const EARTH_MI = 3958.8;

export function distanceMiles(
  lat1: number, lon1: number, lat2: number, lon2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_MI * 2 * Math.asin(Math.sqrt(a));
}

export interface NearbyLake extends Lake {
  distanceMi: number;
}

export function nearbyLakes(
  lat: number, lon: number, limit = 25, minAcres = 20,
): NearbyLake[] {
  return LAKES
    .filter((l) => l.acres >= minAcres)
    .map((l) => ({ ...l, distanceMi: distanceMiles(lat, lon, l.lat, l.lon) }))
    .sort((a, b) => a.distanceMi - b.distanceMi)
    .slice(0, limit);
}

/** Lakes known to hold a given species, best water first. */
export function lakesWithSpecies(
  key: SpeciesKey,
  opts: { near?: { lat: number; lon: number }; limit?: number } = {},
): NearbyLake[] {
  const { near, limit = 50 } = opts;
  const matches = LAKES.filter((l) => l.species.some((s) => s.key === key));

  const withDistance = matches.map((l) => ({
    ...l,
    distanceMi: near ? distanceMiles(near.lat, near.lon, l.lat, l.lon) : 0,
  }));

  if (near) {
    withDistance.sort((a, b) => a.distanceMi - b.distanceMi);
  } else {
    // Without a location, rank by how strongly the DNR rates the population,
    // then by size -- a big lake where they are "Common" beats a pond.
    const rank = { Abundant: 0, Common: 1, Present: 2 } as const;
    withDistance.sort((a, b) => {
      const ra = rank[a.species.find((s) => s.key === key)!.abundance ?? "Present"];
      const rb = rank[b.species.find((s) => s.key === key)!.abundance ?? "Present"];
      return ra - rb || b.acres - a.acres;
    });
  }
  return withDistance.slice(0, limit);
}

/** How many lakes hold each species -- drives the species index page. */
export function speciesCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const lake of LAKES) {
    for (const s of lake.species) counts[s.key] = (counts[s.key] ?? 0) + 1;
  }
  return counts;
}

/** Species present in a lake, resolved to full profiles for display. */
export function lakeSpeciesProfiles(lake: Lake) {
  return lake.species
    .map((s) => ({ ...s, profile: SPECIES[s.key] }))
    .filter((s) => s.profile);
}
