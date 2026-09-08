/**
 * Bite forecast engine.
 *
 * A pure, dependency-free scoring function: weather in, a 0-100 score and a list
 * of human-readable reasons out. No I/O, no framework -- which keeps it unit
 * testable and portable to a native app later.
 *
 * IMPORTANT: this is a heuristic model built on well-established angling
 * relationships (barometric trend, light level, wind, water temperature,
 * solunar periods). It is not a validated predictive model, and the UI must
 * always show the reasoning rather than presenting a bare number as fact.
 */

import { SPECIES, type SpeciesKey, type LightPreference } from "./species";

export interface WeatherHour {
  /** ISO local time, e.g. "2026-09-08T14:00". */
  time: string;
  tempF: number;
  pressureHpa: number;
  windMph: number;
  windDirDeg: number;
  cloudPct: number;
  precipIn: number;
}

export interface CelestialTimes {
  sunrise: Date;
  sunset: Date;
  /** Moon transit (overhead) and anti-transit (underfoot) -- solunar majors. */
  moonTransit?: Date | null;
  moonUnderfoot?: Date | null;
  /** Moonrise / moonset -- solunar minors. */
  moonrise?: Date | null;
  moonset?: Date | null;
  /** 0 = new, 0.5 = full, 1 = new again. */
  moonPhase: number;
}

export interface ForecastInput {
  /** Hourly series that must extend at least 6h BEFORE `at` for pressure trend. */
  hours: WeatherHour[];
  at: Date;
  celestial: CelestialTimes;
  species: SpeciesKey;
  /** Estimated surface water temperature (°F). */
  waterTempF: number;
}

export interface Factor {
  label: string;
  detail: string;
  /** Points contributed, positive or negative. */
  delta: number;
}

export type Rating = "Poor" | "Slow" | "Fair" | "Good" | "Prime";

export interface BiteForecast {
  score: number;
  rating: Rating;
  factors: Factor[];
  summary: string;
}

const BASELINE = 50;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function hoursBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / 3_600_000;
}

/** Nearest hourly sample to a given instant. */
function sampleAt(hours: WeatherHour[], at: Date): WeatherHour | null {
  let best: WeatherHour | null = null;
  let bestGap = Infinity;
  for (const h of hours) {
    const gap = Math.abs(new Date(h.time).getTime() - at.getTime());
    if (gap < bestGap) {
      bestGap = gap;
      best = h;
    }
  }
  return best;
}

// --- individual factors -----------------------------------------------------

/**
 * Barometric trend is the single most predictive variable in the model.
 * Fish feed ahead of an arriving front (falling pressure) and shut down behind
 * one (sharp rise) -- the classic "bluebird day after the storm" problem.
 */
function pressureFactor(hours: WeatherHour[], at: Date): Factor {
  const now = sampleAt(hours, at);
  const then = sampleAt(hours, new Date(at.getTime() - 6 * 3_600_000));
  if (!now || !then) {
    return { label: "Pressure", detail: "No pressure history available", delta: 0 };
  }
  const change = now.pressureHpa - then.pressureHpa;
  const mb = change.toFixed(1);

  if (change <= -2.5)
    return {
      label: "Pressure",
      detail: `Falling fast (${mb} mb in 6h) — feeding window ahead of a front`,
      delta: 16,
    };
  if (change <= -0.7)
    return {
      label: "Pressure",
      detail: `Falling steadily (${mb} mb in 6h) — fish moving up to feed`,
      delta: 11,
    };
  if (change < 0.7)
    return {
      label: "Pressure",
      detail: `Stable (${mb} mb in 6h) — settled, predictable patterns`,
      delta: 3,
    };
  if (change < 2.5)
    return {
      label: "Pressure",
      detail: `Rising (+${mb} mb in 6h) — fish easing back off the bite`,
      delta: -6,
    };
  return {
    label: "Pressure",
    detail: `Rising sharply (+${mb} mb in 6h) — post-frontal shutdown likely`,
    delta: -14,
  };
}

/** Light wind puts a chop on the surface, breaking up light and emboldening fish. */
function windFactor(hours: WeatherHour[], at: Date): Factor {
  const now = sampleAt(hours, at);
  if (!now) return { label: "Wind", detail: "No wind data", delta: 0 };
  const w = Math.round(now.windMph);
  const dir = compass(now.windDirDeg);

  if (w <= 2)
    return {
      label: "Wind",
      detail: `Dead calm (${w} mph) — slick water, spooky fish`,
      delta: -6,
    };
  if (w <= 10)
    return {
      label: "Wind",
      detail: `Light ${dir} chop (${w} mph) — close to ideal`,
      delta: 10,
    };
  if (w <= 16)
    return {
      label: "Wind",
      detail: `Moderate ${dir} wind (${w} mph) — good on windblown structure`,
      delta: 4,
    };
  if (w <= 24)
    return {
      label: "Wind",
      detail: `Strong ${dir} wind (${w} mph) — boat control gets difficult`,
      delta: -5,
    };
  return {
    label: "Wind",
    detail: `${w} mph ${dir} — small water only, if at all`,
    delta: -13,
  };
}

function cloudFactor(hours: WeatherHour[], at: Date, light: LightPreference): Factor {
  const now = sampleAt(hours, at);
  if (!now) return { label: "Sky", detail: "No cloud data", delta: 0 };
  const c = Math.round(now.cloudPct);
  const sky = c >= 70 ? "Overcast" : c >= 30 ? "Partly cloudy" : "Clear";

  if (light === "low") {
    if (c >= 70) return { label: "Sky", detail: `${sky} (${c}%) — extends the low-light bite all day`, delta: 9 };
    if (c >= 30) return { label: "Sky", detail: `${sky} (${c}%) — workable`, delta: 3 };
    return { label: "Sky", detail: `${sky} (${c}%) — bright sun pushes them deep`, delta: -6 };
  }
  if (light === "bright") {
    if (c < 30) return { label: "Sky", detail: `${sky} (${c}%) — sun warms the shallows and gets them active`, delta: 5 };
    if (c < 70) return { label: "Sky", detail: `${sky} (${c}%) — fine`, delta: 2 };
    return { label: "Sky", detail: `${sky} (${c}%) — less active without sun`, delta: -2 };
  }
  if (c >= 30 && c < 80) return { label: "Sky", detail: `${sky} (${c}%) — ideal mix`, delta: 6 };
  if (c >= 80) return { label: "Sky", detail: `${sky} (${c}%) — fish roam wider off cover`, delta: 3 };
  return { label: "Sky", detail: `${sky} (${c}%) — expect them tight to cover`, delta: -2 };
}

/** Dawn and dusk are the reliable daily peaks, strongest for low-light species. */
function timeOfDayFactor(at: Date, c: CelestialTimes, light: LightPreference): Factor {
  const toSunrise = hoursBetween(at, c.sunrise);
  const toSunset = hoursBetween(at, c.sunset);
  const edge = Math.min(toSunrise, toSunset);
  const which = toSunrise < toSunset ? "sunrise" : "sunset";
  const isDay = at > c.sunrise && at < c.sunset;

  const peak = light === "low" ? 15 : light === "moderate" ? 10 : 5;

  if (edge <= 1)
    return { label: "Time of day", detail: `Within an hour of ${which} — the daily peak`, delta: peak };
  if (edge <= 2)
    return { label: "Time of day", detail: `Approaching the ${which} window`, delta: Math.round(peak * 0.6) };
  if (!isDay) {
    const night = light === "low" ? 6 : -4;
    return {
      label: "Time of day",
      detail: light === "low" ? "After dark — good for night feeders" : "After dark — most fish are resting",
      delta: night,
    };
  }
  const midday = light === "bright" ? 3 : light === "moderate" ? -3 : -7;
  return {
    label: "Time of day",
    detail: light === "bright" ? "Midday sun — fine for panfish" : "Midday — the slowest stretch",
    delta: midday,
  };
}

/**
 * Water temperature relative to the species' preferred band. This is the factor
 * that makes a forecast species-specific rather than generic "fishing weather".
 */
function waterTempFactor(waterTempF: number, species: SpeciesKey): Factor {
  const p = SPECIES[species];
  const [lo, hi] = p.optimalTempF;
  const [tlo, thi] = p.toleratedTempF;
  const [slo, shi] = p.spawnTempF;
  const t = Math.round(waterTempF);

  if (t >= slo && t <= shi) {
    return {
      label: "Water temp",
      detail: `~${t}°F — spawn window for ${p.name.toLowerCase()}; fish are shallow but preoccupied`,
      delta: -3,
    };
  }
  if (t >= lo && t <= hi) {
    return { label: "Water temp", detail: `~${t}°F — squarely in the active feeding range`, delta: 12 };
  }
  if (t < tlo || t > thi) {
    return {
      label: "Water temp",
      detail: `~${t}°F — outside what ${p.name.toLowerCase()} tolerate; expect a slow day`,
      delta: -15,
    };
  }
  // Inside tolerated but outside optimal: scale by how far off we are.
  const distance = t < lo ? lo - t : t - hi;
  const room = t < lo ? Math.max(1, lo - tlo) : Math.max(1, thi - hi);
  const delta = Math.round(6 - 14 * clamp(distance / room, 0, 1));
  return {
    label: "Water temp",
    detail: `~${t}°F — ${t < lo ? "cooler" : "warmer"} than ideal, metabolism is off peak`,
    delta,
  };
}

/** Solunar theory: feeding peaks when the moon is overhead or underfoot. */
function solunarFactor(at: Date, c: CelestialTimes): Factor {
  const majors = [c.moonTransit, c.moonUnderfoot].filter(Boolean) as Date[];
  const minors = [c.moonrise, c.moonset].filter(Boolean) as Date[];

  const nearMajor = majors.some((m) => hoursBetween(at, m) <= 1);
  const nearMinor = minors.some((m) => hoursBetween(at, m) <= 0.75);

  // Illumination extremes (new and full) run the strongest tides and feeding.
  const phaseStrength = Math.abs(Math.cos(2 * Math.PI * c.moonPhase)); // 1 at new/full
  const phaseBonus = Math.round(phaseStrength * 4);
  const phaseName = moonPhaseName(c.moonPhase);

  if (nearMajor)
    return { label: "Solunar", detail: `Major period — moon overhead or underfoot (${phaseName})`, delta: 8 + phaseBonus };
  if (nearMinor)
    return { label: "Solunar", detail: `Minor period — moonrise/moonset (${phaseName})`, delta: 4 + phaseBonus };
  return { label: "Solunar", detail: `No moon period active (${phaseName})`, delta: phaseBonus - 2 };
}

function precipFactor(hours: WeatherHour[], at: Date): Factor {
  const now = sampleAt(hours, at);
  if (!now) return { label: "Precipitation", detail: "No data", delta: 0 };
  const p = now.precipIn;
  if (p === 0) return { label: "Precipitation", detail: "Dry", delta: 0 };
  if (p < 0.05) return { label: "Precipitation", detail: "Light drizzle — softens light, often helps", delta: 5 };
  if (p < 0.2) return { label: "Precipitation", detail: "Steady rain — good bite, wet day", delta: 2 };
  return { label: "Precipitation", detail: "Heavy rain — runoff and muddy water", delta: -9 };
}

// --- helpers ---------------------------------------------------------------

export function compass(deg: number): string {
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
                "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return dirs[Math.round(((deg % 360) / 22.5)) % 16];
}

export function moonPhaseName(phase: number): string {
  const p = ((phase % 1) + 1) % 1;
  if (p < 0.03 || p > 0.97) return "new moon";
  if (p < 0.22) return "waxing crescent";
  if (p < 0.28) return "first quarter";
  if (p < 0.47) return "waxing gibbous";
  if (p < 0.53) return "full moon";
  if (p < 0.72) return "waning gibbous";
  if (p < 0.78) return "last quarter";
  return "waning crescent";
}

export function ratingFor(score: number): Rating {
  if (score >= 78) return "Prime";
  if (score >= 62) return "Good";
  if (score >= 45) return "Fair";
  if (score >= 30) return "Slow";
  return "Poor";
}

// --- the engine -------------------------------------------------------------

export function biteForecast(input: ForecastInput): BiteForecast {
  const { hours, at, celestial, species, waterTempF } = input;
  const profile = SPECIES[species];

  const factors: Factor[] = [
    pressureFactor(hours, at),
    waterTempFactor(waterTempF, species),
    timeOfDayFactor(at, celestial, profile.light),
    windFactor(hours, at),
    cloudFactor(hours, at, profile.light),
    solunarFactor(at, celestial),
    precipFactor(hours, at),
  ];

  const raw = factors.reduce((sum, f) => sum + f.delta, BASELINE);
  const score = Math.round(clamp(raw, 0, 100));
  const rating = ratingFor(score);

  // Summarise using whichever factors actually moved the needle.
  const ranked = [...factors].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const top = ranked.filter((f) => f.delta !== 0).slice(0, 3);
  const summary =
    top.length > 0
      ? top.map((f) => f.detail.split(" — ")[0].toLowerCase()).join(", ")
      : "conditions are unremarkable";

  return { score, rating, factors, summary };
}
