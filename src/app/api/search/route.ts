import { NextResponse } from "next/server";
import { searchLakes, nearbyLakes, type Lake } from "@/lib/lakes";
import { SPECIES, type SpeciesKey } from "@/lib/species";

/** Trim the payload to what the results list actually renders. */
function slim(lake: Lake, distanceMi?: number, species?: SpeciesKey) {
  return {
    wbic: lake.wbic,
    name: lake.name,
    county: lake.county,
    acres: lake.acres,
    maxDepthFt: lake.maxDepthFt,
    speciesCount: lake.species.length,
    distanceMi,
    abundance: species
      ? (lake.species.find((s) => s.key === species)?.abundance ?? null)
      : undefined,
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const lat = url.searchParams.get("lat");
  const lon = url.searchParams.get("lon");
  const speciesParam = url.searchParams.get("species");
  const species =
    speciesParam && speciesParam in SPECIES ? (speciesParam as SpeciesKey) : null;
  const onlySpecies = (l: Lake) =>
    !species || l.species.some((s) => s.key === species);

  if (lat && lon) {
    const latNum = Number(lat);
    const lonNum = Number(lon);
    if (!Number.isFinite(latNum) || !Number.isFinite(lonNum)) {
      return NextResponse.json({ error: "invalid coordinates" }, { status: 400 });
    }
    // Widen the candidate pool when filtering, so a rarer species still fills
    // a useful list rather than returning two lakes.
    const pool = nearbyLakes(latNum, lonNum, species ? 400 : 25);
    const results = pool
      .filter(onlySpecies)
      .slice(0, 25)
      .map((l) => slim(l, Math.round(l.distanceMi * 10) / 10, species ?? undefined));
    return NextResponse.json({ results, mode: "nearby" });
  }

  if (q.length < 2) return NextResponse.json({ results: [], mode: "search" });
  const hits = searchLakes(q, species ? 400 : 30).filter(onlySpecies).slice(0, 30);
  return NextResponse.json({
    results: hits.map((l) => slim(l, undefined, species ?? undefined)),
    mode: "search",
  });
}
