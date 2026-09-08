import { NextResponse } from "next/server";

import { lakesWithSpecies } from "@/lib/lakes";
import { SPECIES, type SpeciesKey } from "@/lib/species";
import {
  fetchWeatherForMany,
  bundleFor,
  estimateWaterTempF,
  celestialFor,
} from "@/lib/weather";
import { biteForecast } from "@/lib/forecast";

// One bulk weather call per hour covers every request in that window.
export const revalidate = 3600;

/** How many of the closest lakes to score. Bounded because nobody drives 200 miles. */
const MAX_LAKES = 40;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  if (!(key in SPECIES)) {
    return NextResponse.json({ error: "unknown species" }, { status: 404 });
  }
  const species = key as SpeciesKey;

  const url = new URL(request.url);
  const lat = Number(url.searchParams.get("lat"));
  const lon = Number(url.searchParams.get("lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json({ error: "invalid coordinates" }, { status: 400 });
  }

  const lakes = lakesWithSpecies(species, { near: { lat, lon }, limit: MAX_LAKES });
  if (lakes.length === 0) return NextResponse.json({ results: [] });

  let bundles;
  try {
    bundles = await fetchWeatherForMany(lakes.map((l) => ({ lat: l.lat, lon: l.lon })));
  } catch {
    return NextResponse.json({ error: "weather unavailable" }, { status: 503 });
  }

  const now = new Date();
  const results = [];

  for (const lake of lakes) {
    const weather = bundleFor(bundles, lake.lat, lake.lon);
    if (!weather) continue;

    const waterTempF = estimateWaterTempF(
      weather.dailyMeanAirF,
      { acres: lake.acres, maxDepthFt: lake.maxDepthFt },
      weather.todayIndex,
    );
    const celestial = celestialFor(
      now,
      lake.lat,
      lake.lon,
      weather.sunrise[weather.todayIndex],
      weather.sunset[weather.todayIndex],
    );
    const forecast = biteForecast({
      hours: weather.hours,
      at: now,
      celestial,
      species,
      waterTempF,
    });

    results.push({
      wbic: lake.wbic,
      // Carry full lake details: the scored lakes are the *nearest*, while the
      // page ships the *largest* statewide, so the two sets barely overlap and
      // the client cannot look these up locally.
      name: lake.name,
      county: lake.county,
      acres: lake.acres,
      score: forecast.score,
      rating: forecast.rating,
      summary: forecast.summary,
      distanceMi: Math.round(lake.distanceMi * 10) / 10,
      waterTempF: Math.round(waterTempF),
      abundance: lake.species.find((s) => s.key === species)?.abundance ?? null,
    });
  }

  // Weather barely varies between lakes an hour apart, so on most days the
  // scores cluster and sorting on score alone degenerates into sorting by
  // distance. Where conditions tie, the population rating is what actually
  // decides where to go: same weather, more fish.
  const ABUNDANCE_RANK: Record<string, number> = {
    Abundant: 0,
    Common: 1,
    Present: 2,
  };
  const rank = (a: string | null) => ABUNDANCE_RANK[a ?? "Present"] ?? 2;

  results.sort(
    (a, b) =>
      b.score - a.score ||
      rank(a.abundance) - rank(b.abundance) ||
      a.distanceMi - b.distanceMi,
  );

  // Tell the client when conditions are effectively uniform, so the UI can say
  // so rather than implying the top lake is meaningfully better.
  const spread =
    results.length > 1 ? results[0].score - results[results.length - 1].score : 0;

  return NextResponse.json({ results, scored: results.length, spread });
}
