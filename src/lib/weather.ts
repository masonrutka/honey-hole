/**
 * Open-Meteo client plus surface water temperature estimation.
 *
 * Open-Meteo is free, needs no API key, and allows 10k calls/day for
 * non-commercial use. We cache aggressively to stay well under that.
 */

import * as SunCalc from "suncalc";
import type { WeatherHour, CelestialTimes } from "./forecast";

const ENDPOINT = "https://api.open-meteo.com/v1/forecast";

export interface WeatherBundle {
  hours: WeatherHour[];
  /** Daily mean air temps, past 7 days first -- feeds the water temp estimate. */
  dailyMeanAirF: number[];
  timezone: string;
  utcOffsetSeconds: number;
  sunrise: Date[];
  sunset: Date[];
  /** Index into sunrise/sunset arrays for "today". */
  todayIndex: number;
}

/**
 * Open-Meteo returns wall-clock strings with no zone ("2026-09-08T06:25").
 * Combined with utc_offset_seconds they become real instants, which keeps every
 * downstream comparison (including SunCalc's) in one consistent frame.
 */
function toInstant(local: string, utcOffsetSeconds: number): Date {
  return new Date(Date.parse(`${local}:00Z`) - utcOffsetSeconds * 1000);
}

const PAST_DAYS = 7;
/** How far ahead the outlook strip can look. Open-Meteo allows up to 16. */
export const FORECAST_DAYS = 7;

export async function fetchWeather(
  lat: number,
  lon: number,
  revalidateSeconds = 3600,
): Promise<WeatherBundle> {
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    hourly: [
      "temperature_2m",
      "surface_pressure",
      "wind_speed_10m",
      "wind_direction_10m",
      "cloud_cover",
      "precipitation",
    ].join(","),
    daily: ["sunrise", "sunset", "temperature_2m_mean"].join(","),
    past_days: String(PAST_DAYS),
    forecast_days: String(FORECAST_DAYS),
    temperature_unit: "fahrenheit",
    wind_speed_unit: "mph",
    precipitation_unit: "inch",
    timezone: "auto",
  });

  const res = await fetch(`${ENDPOINT}?${params}`, {
    next: { revalidate: revalidateSeconds },
  });
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}: ${res.statusText}`);
  const d = await res.json();

  const offset: number = d.utc_offset_seconds ?? 0;
  const h = d.hourly;

  const hours: WeatherHour[] = h.time.map((t: string, i: number) => ({
    time: toInstant(t, offset).toISOString(),
    tempF: h.temperature_2m[i],
    pressureHpa: h.surface_pressure[i],
    windMph: h.wind_speed_10m[i],
    windDirDeg: h.wind_direction_10m[i],
    cloudPct: h.cloud_cover[i],
    precipIn: h.precipitation[i],
  }));

  return {
    hours,
    dailyMeanAirF: d.daily.temperature_2m_mean,
    timezone: d.timezone,
    utcOffsetSeconds: offset,
    sunrise: d.daily.sunrise.map((s: string) => toInstant(s, offset)),
    sunset: d.daily.sunset.map((s: string) => toInstant(s, offset)),
    todayIndex: PAST_DAYS, // past_days entries come first
  };
}

/**
 * Estimate surface water temperature from recent air temperature.
 *
 * This is the weakest input in the whole model and must be labelled as an
 * estimate in the UI. USGS gauges cover rivers, not inland lakes, so there is
 * no free live feed of Wisconsin lake temps.
 *
 * The physics we approximate: water has far more thermal mass than air, so it
 * lags. A shallow 20-acre pond tracks the air within a few days; a deep 10,000
 * acre lake lags a couple of weeks. We take an exponentially weighted mean of
 * recent daily air temps with a time constant scaled by lake size and depth.
 */
export function estimateWaterTempF(
  dailyMeanAirF: number[],
  lake: { acres: number; maxDepthFt?: number | null },
  todayIndex: number,
): number {
  const past = dailyMeanAirF.slice(0, todayIndex + 1).filter((n) => typeof n === "number");
  if (past.length === 0) return 60;

  // Thermal lag in days: deeper and larger water responds more slowly.
  const depth = lake.maxDepthFt ?? 15;
  const tau = Math.min(14, Math.max(2, 1.5 + depth / 6 + Math.log10(Math.max(1, lake.acres))));

  let weighted = 0;
  let weight = 0;
  // index 0 is oldest; give the most recent days the most influence.
  past.forEach((temp, i) => {
    const daysAgo = past.length - 1 - i;
    const w = Math.exp(-daysAgo / tau);
    weighted += temp * w;
    weight += w;
  });
  const lagged = weighted / weight;

  // Surface water runs a touch warmer than mean air in summer (solar gain) and
  // cannot fall below freezing.
  const solarGain = lagged > 60 ? 2 : 0;
  return Math.max(32, Math.min(88, lagged + solarGain));
}

/** Sun and moon geometry for the solunar and time-of-day factors. */
export function celestialFor(
  at: Date,
  lat: number,
  lon: number,
  sunrise: Date,
  sunset: Date,
): CelestialTimes {
  const moonTimes = SunCalc.getMoonTimes(at, lat, lon);
  const illum = SunCalc.getMoonIllumination(at);

  // SunCalc has no transit helper, so find when lunar azimuth crosses due south
  // (northern hemisphere) by scanning the day at 10-minute resolution.
  const dayStart = new Date(at);
  dayStart.setHours(0, 0, 0, 0);
  let transit: Date | null = null;
  let bestAlt = -Infinity;
  for (let m = 0; m < 24 * 60; m += 10) {
    const t = new Date(dayStart.getTime() + m * 60_000);
    const pos = SunCalc.getMoonPosition(t, lat, lon);
    if (pos.altitude > bestAlt) {
      bestAlt = pos.altitude;
      transit = t;
    }
  }
  // Underfoot is roughly 12h24m from overhead (half a lunar day).
  const underfoot = transit
    ? new Date(transit.getTime() + 12.42 * 3_600_000)
    : null;

  return {
    sunrise,
    sunset,
    moonTransit: transit,
    moonUnderfoot: underfoot,
    moonrise: moonTimes.rise ?? null,
    moonset: moonTimes.set ?? null,
    moonPhase: illum.phase,
  };
}

/**
 * Weather for many lakes in one request.
 *
 * Open-Meteo accepts comma-separated coordinate lists and returns an array, so
 * ranking 40 lakes costs one HTTP call rather than 40. Coordinates are snapped
 * to a coarse grid first: weather does not meaningfully differ between two
 * lakes ten miles apart, and deduping keeps the request small.
 */
const GRID_DEGREES = 0.25; // ~17 miles

function gridKey(lat: number, lon: number): string {
  const gLat = Math.round(lat / GRID_DEGREES) * GRID_DEGREES;
  const gLon = Math.round(lon / GRID_DEGREES) * GRID_DEGREES;
  return `${gLat.toFixed(2)},${gLon.toFixed(2)}`;
}

export async function fetchWeatherForMany(
  points: { lat: number; lon: number }[],
  revalidateSeconds = 3600,
): Promise<Map<string, WeatherBundle>> {
  const cells = new Map<string, { lat: number; lon: number }>();
  for (const p of points) {
    const key = gridKey(p.lat, p.lon);
    if (!cells.has(key)) {
      const [lat, lon] = key.split(",").map(Number);
      cells.set(key, { lat, lon });
    }
  }
  if (cells.size === 0) return new Map();

  const entries = [...cells.entries()];
  const params = new URLSearchParams({
    latitude: entries.map(([, c]) => c.lat.toFixed(4)).join(","),
    longitude: entries.map(([, c]) => c.lon.toFixed(4)).join(","),
    hourly: [
      "temperature_2m",
      "surface_pressure",
      "wind_speed_10m",
      "wind_direction_10m",
      "cloud_cover",
      "precipitation",
    ].join(","),
    daily: ["sunrise", "sunset", "temperature_2m_mean"].join(","),
    past_days: String(PAST_DAYS),
    forecast_days: "1",
    temperature_unit: "fahrenheit",
    wind_speed_unit: "mph",
    precipitation_unit: "inch",
    timezone: "auto",
  });

  const res = await fetch(`${ENDPOINT}?${params}`, {
    next: { revalidate: revalidateSeconds },
  });
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}: ${res.statusText}`);

  const payload = await res.json();
  // A single coordinate returns an object; several return an array.
  const list = Array.isArray(payload) ? payload : [payload];

  const out = new Map<string, WeatherBundle>();
  list.forEach((d, i) => {
    const key = entries[i]?.[0];
    if (!key || !d?.hourly) return;
    const offset: number = d.utc_offset_seconds ?? 0;
    const h = d.hourly;
    out.set(key, {
      hours: h.time.map((t: string, j: number) => ({
        time: toInstant(t, offset).toISOString(),
        tempF: h.temperature_2m[j],
        pressureHpa: h.surface_pressure[j],
        windMph: h.wind_speed_10m[j],
        windDirDeg: h.wind_direction_10m[j],
        cloudPct: h.cloud_cover[j],
        precipIn: h.precipitation[j],
      })),
      dailyMeanAirF: d.daily.temperature_2m_mean,
      timezone: d.timezone,
      utcOffsetSeconds: offset,
      sunrise: d.daily.sunrise.map((s: string) => toInstant(s, offset)),
      sunset: d.daily.sunset.map((s: string) => toInstant(s, offset)),
      todayIndex: PAST_DAYS,
    });
  });
  return out;
}

/** Look up the bundle covering a lake's coordinates. */
export function bundleFor(
  bundles: Map<string, WeatherBundle>,
  lat: number,
  lon: number,
): WeatherBundle | undefined {
  return bundles.get(gridKey(lat, lon));
}
