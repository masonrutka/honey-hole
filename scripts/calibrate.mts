/**
 * Score a year of real Wisconsin weather through the actual bite engine and
 * report the resulting distribution.
 *
 * Calibration cannot be judged from one evening's forecast. This replays real
 * historical conditions -- cold fronts, bluebird days, storms, ice season --
 * across many lakes and species, so the weights can be checked against the
 * shape of the whole distribution rather than a single good night.
 *
 * Usage:  npx tsx scripts/calibrate.mts [--days 365]
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { biteForecast, ratingFor, type WeatherHour } from "../src/lib/forecast.ts";
import { estimateWaterTempF, celestialFor } from "../src/lib/weather.ts";
import { ALL_SPECIES, type SpeciesKey } from "../src/lib/species.ts";

const CACHE = new URL("../ingest/cache/archive/", import.meta.url).pathname;
const ARCHIVE = "https://archive-api.open-meteo.com/v1/archive";

interface Lake {
  wbic: number; name: string; lat: number; lon: number;
  acres: number; maxDepthFt: number | null; species: { key: SpeciesKey }[];
}

const days = Number(process.argv[process.argv.indexOf("--days") + 1]) || 365;
const END = new Date(Date.now() - 3 * 86_400_000); // archive lags a couple of days
const START = new Date(END.getTime() - days * 86_400_000);
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** A geographically and physically varied sample, not just the biggest lakes. */
function pickLakes(all: Lake[], n = 20): Lake[] {
  const usable = all.filter((l) => l.species.length > 0 && l.acres >= 50);
  usable.sort((a, b) => a.lat - b.lat);
  const step = Math.floor(usable.length / n);
  return Array.from({ length: n }, (_, i) => usable[i * step]).filter(Boolean);
}

async function archiveFor(lake: Lake) {
  if (!existsSync(CACHE)) mkdirSync(CACHE, { recursive: true });
  const path = `${CACHE}${lake.wbic}-${days}.json`;
  if (existsSync(path)) return JSON.parse(readFileSync(path, "utf8"));

  const params = new URLSearchParams({
    latitude: lake.lat.toFixed(4),
    longitude: lake.lon.toFixed(4),
    start_date: iso(START),
    end_date: iso(END),
    hourly: "temperature_2m,surface_pressure,wind_speed_10m,wind_direction_10m,cloud_cover,precipitation",
    daily: "sunrise,sunset,temperature_2m_mean",
    temperature_unit: "fahrenheit",
    wind_speed_unit: "mph",
    precipitation_unit: "inch",
    timezone: "auto",
  });
  const res = await fetch(`${ARCHIVE}?${params}`);
  if (!res.ok) throw new Error(`archive ${res.status} for ${lake.name}`);
  const json = await res.json();
  writeFileSync(path, JSON.stringify(json));
  await new Promise((r) => setTimeout(r, 400)); // be polite
  return json;
}

function toInstant(local: string, offset: number): Date {
  return new Date(Date.parse(`${local}:00Z`) - offset * 1000);
}

/** First index whose value is >= target. */
function lowerBound(arr: number[], target: number): number {
  let lo = 0, hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] < target) lo = mid + 1; else hi = mid;
  }
  return lo;
}

const pct = (arr: number[], p: number) =>
  arr.length ? arr[Math.min(arr.length - 1, Math.floor((p / 100) * arr.length))] : NaN;

async function main() {
  const all: Lake[] = JSON.parse(
    readFileSync(new URL("../src/data/lakes.json", import.meta.url).pathname, "utf8"),
  );
  const lakes = pickLakes(all);
  console.log(`Replaying ${days} days (${iso(START)} → ${iso(END)}) across ${lakes.length} lakes\n`);

  const allScores: number[] = [];
  const dayPeaks: number[] = [];
  const bySpecies = new Map<string, number[]>();
  // Day-over-day movement: can the outlook actually distinguish days?
  const weekSpreads: number[] = [];
  // Cold-front check: score change after a sharp pressure rise.
  const frontDrops: number[] = [];

  for (const lake of lakes) {
    let data;
    try { data = await archiveFor(lake); }
    catch (e) { console.log(`  ! ${lake.name}: ${(e as Error).message}`); continue; }

    const offset: number = data.utc_offset_seconds ?? 0;
    const h = data.hourly;
    const hours: WeatherHour[] = h.time.map((t: string, i: number) => ({
      time: toInstant(t, offset).toISOString(),
      tempF: h.temperature_2m[i], pressureHpa: h.surface_pressure[i],
      windMph: h.wind_speed_10m[i], windDirDeg: h.wind_direction_10m[i],
      cloudPct: h.cloud_cover[i], precipIn: h.precipitation[i],
    })).filter((x: WeatherHour) => x.pressureHpa != null && x.tempF != null);

    const sunrise: Date[] = data.daily.sunrise.map((s: string) => toInstant(s, offset));
    const sunset: Date[] = data.daily.sunset.map((s: string) => toInstant(s, offset));
    const means: number[] = data.daily.temperature_2m_mean;

    const species = lake.species.map((s) => s.key).filter((k) => k in Object.fromEntries(ALL_SPECIES.map(p => [p.key, p])));
    const lakePeaksByDay: number[] = [];

    // Index hours by timestamp so each day can be scored against a small local
    // window. biteForecast() linear-scans whatever series it is handed, which is
    // fine for the ~240 hours a page fetches but not for a year of data.
    const hourTimes = hours.map((x) => new Date(x.time).getTime());

    for (let d = 7; d < sunrise.length; d++) {
      if (!sunrise[d] || !sunset[d]) continue;
      const waterTempF = estimateWaterTempF(means, lake, d);
      const celestial = celestialFor(sunrise[d], lake.lat, lake.lon, sunrise[d], sunset[d]);
      const dayStart = new Date(sunrise[d]); dayStart.setUTCMinutes(0, 0, 0);
      const base = dayStart.getTime() - (dayStart.getUTCHours() - 0) * 3_600_000;

      // A day plus the preceding 12h is all the engine needs (pressure trend
      // looks back 6h). Slicing keeps each scoring call cheap.
      const lo = lowerBound(hourTimes, base - 18 * 3_600_000);
      const hi = lowerBound(hourTimes, base + 26 * 3_600_000);
      const window = hours.slice(lo, hi);
      if (window.length < 12) continue;

      let peak = -1;
      for (const sp of species) {
        for (let hr = 5; hr <= 21; hr++) {
          const at = new Date(base + hr * 3_600_000);
          const { score } = biteForecast({ hours: window, at, celestial, species: sp as SpeciesKey, waterTempF });
          allScores.push(score);
          if (!bySpecies.has(sp)) bySpecies.set(sp, []);
          bySpecies.get(sp)!.push(score);
          if (score > peak) peak = score;
        }
      }
      if (peak >= 0) { dayPeaks.push(peak); lakePeaksByDay.push(peak); }

      // Pressure change over this day, to spot frontal passages.
      const p0 = hours.find((x) => new Date(x.time) >= new Date(base + 6 * 3_600_000));
      const p1 = hours.find((x) => new Date(x.time) >= new Date(base + 18 * 3_600_000));
      if (p0 && p1 && p1.pressureHpa - p0.pressureHpa > 5 && lakePeaksByDay.length > 1) {
        frontDrops.push(peak - lakePeaksByDay[lakePeaksByDay.length - 2]);
      }
    }

    for (let i = 0; i + 5 <= lakePeaksByDay.length; i += 5) {
      const w = lakePeaksByDay.slice(i, i + 5);
      weekSpreads.push(Math.max(...w) - Math.min(...w));
    }
  }

  const sorted = [...allScores].sort((a, b) => a - b);
  const peaksSorted = [...dayPeaks].sort((a, b) => a - b);
  const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;

  console.log(`Scored ${allScores.length.toLocaleString()} hours\n`);
  console.log("HOURLY SCORE DISTRIBUTION");
  for (const p of [1, 5, 25, 50, 75, 95, 99]) {
    console.log(`  p${String(p).padStart(2)}  ${pct(sorted, p)}`);
  }
  console.log(`  mean ${mean(allScores).toFixed(1)}`);
  console.log(`  at 100 (clamped): ${(100 * sorted.filter((s) => s >= 100).length / sorted.length).toFixed(2)}%`);
  console.log(`  at 0:             ${(100 * sorted.filter((s) => s <= 0).length / sorted.length).toFixed(2)}%`);

  const ratings = new Map<string, number>();
  for (const s of allScores) ratings.set(ratingFor(s), (ratings.get(ratingFor(s)) ?? 0) + 1);
  console.log("\nRATING MIX (hourly)");
  for (const r of ["Prime", "Good", "Fair", "Slow", "Poor"]) {
    const n = ratings.get(r) ?? 0;
    const share = (100 * n) / allScores.length;
    console.log(`  ${r.padEnd(6)} ${share.toFixed(1).padStart(5)}%  ${"█".repeat(Math.round(share / 2))}`);
  }

  console.log("\nDAILY PEAK (what the outlook strip shows)");
  for (const p of [5, 25, 50, 75, 95]) console.log(`  p${String(p).padStart(2)}  ${pct(peaksSorted, p)}`);
  console.log(`  at 100: ${(100 * peaksSorted.filter((s) => s >= 100).length / peaksSorted.length).toFixed(2)}%`);
  console.log(`  spread within a 5-day week: median ${pct([...weekSpreads].sort((a,b)=>a-b), 50)}, mean ${mean(weekSpreads).toFixed(1)}`);

  if (frontDrops.length) {
    console.log(`\nCOLD FRONT CHECK (${frontDrops.length} sharp pressure rises)`);
    console.log(`  mean day-peak change after front: ${mean(frontDrops).toFixed(1)}`);
    console.log(`  dropped: ${(100 * frontDrops.filter((d) => d < 0).length / frontDrops.length).toFixed(0)}% of the time`);
  }

  console.log("\nBY SPECIES (median hourly)");
  for (const [sp, arr] of [...bySpecies].sort((a, b) => b[1].length - a[1].length)) {
    const s = [...arr].sort((a, b) => a - b);
    console.log(`  ${sp.padEnd(17)} median ${String(pct(s, 50)).padStart(3)}   p95 ${String(pct(s, 95)).padStart(3)}   n=${arr.length.toLocaleString()}`);
  }
}

main();
