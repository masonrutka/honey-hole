import { NextResponse } from "next/server";
import { searchLakes, nearbyLakes, type Lake } from "@/lib/lakes";

/** Trim the payload to what the results list actually renders. */
function slim(lake: Lake, distanceMi?: number) {
  return {
    wbic: lake.wbic,
    name: lake.name,
    county: lake.county,
    acres: lake.acres,
    maxDepthFt: lake.maxDepthFt,
    speciesCount: lake.species.length,
    distanceMi,
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const lat = url.searchParams.get("lat");
  const lon = url.searchParams.get("lon");

  if (lat && lon) {
    const latNum = Number(lat);
    const lonNum = Number(lon);
    if (!Number.isFinite(latNum) || !Number.isFinite(lonNum)) {
      return NextResponse.json({ error: "invalid coordinates" }, { status: 400 });
    }
    const results = nearbyLakes(latNum, lonNum, 25).map((l) =>
      slim(l, Math.round(l.distanceMi * 10) / 10),
    );
    return NextResponse.json({ results, mode: "nearby" });
  }

  if (q.length < 2) return NextResponse.json({ results: [], mode: "search" });
  return NextResponse.json({
    results: searchLakes(q, 30).map((l) => slim(l)),
    mode: "search",
  });
}
