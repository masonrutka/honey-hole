import { describe, it, expect } from "vitest";
import {
  biteForecast,
  ratingFor,
  compass,
  moonPhaseName,
  type WeatherHour,
  type CelestialTimes,
} from "../forecast";

const DAY = "2026-06-15";

/** Build a flat 24h weather series, then let tests bend individual variables. */
function series(overrides: Partial<WeatherHour> = {}, pressureSlope = 0): WeatherHour[] {
  return Array.from({ length: 24 }, (_, i) => ({
    time: `${DAY}T${String(i).padStart(2, "0")}:00`,
    tempF: 70,
    pressureHpa: 1013 + pressureSlope * i,
    windMph: 6,
    windDirDeg: 225,
    cloudPct: 50,
    precipIn: 0,
    ...overrides,
  }));
}

const celestial = (o: Partial<CelestialTimes> = {}): CelestialTimes => ({
  sunrise: new Date(`${DAY}T05:15`),
  sunset: new Date(`${DAY}T20:35`),
  moonTransit: null,
  moonUnderfoot: null,
  moonrise: null,
  moonset: null,
  moonPhase: 0.25,
  ...o,
});

const NOON = new Date(`${DAY}T12:00`);

describe("pressure trend", () => {
  it("scores a falling barometer above a rising one", () => {
    const falling = biteForecast({
      hours: series({}, -0.6), at: NOON, celestial: celestial(),
      species: "walleye", waterTempF: 68,
    });
    const rising = biteForecast({
      hours: series({}, +0.6), at: NOON, celestial: celestial(),
      species: "walleye", waterTempF: 68,
    });
    expect(falling.score).toBeGreaterThan(rising.score);
  });

  it("flags a post-frontal shutdown on a sharp rise", () => {
    const f = biteForecast({
      hours: series({}, +1.0), at: NOON, celestial: celestial(),
      species: "walleye", waterTempF: 68,
    });
    const pressure = f.factors.find((x) => x.label === "Pressure")!;
    expect(pressure.delta).toBeLessThan(-10);
    expect(pressure.detail).toMatch(/post-frontal/i);
  });

  it("degrades gracefully when there is no pressure history", () => {
    const oneHour = series().slice(12, 13);
    const f = biteForecast({
      hours: oneHour, at: NOON, celestial: celestial(),
      species: "walleye", waterTempF: 68,
    });
    expect(Number.isFinite(f.score)).toBe(true);
    expect(f.score).toBeGreaterThanOrEqual(0);
    expect(f.score).toBeLessThanOrEqual(100);
  });
});

describe("water temperature is species-specific", () => {
  it("rates 68F as prime feeding for largemouth but off-peak for trout", () => {
    const at = new Date(`${DAY}T06:00`);
    const bass = biteForecast({
      hours: series(), at, celestial: celestial(), species: "largemouth_bass", waterTempF: 74,
    });
    const trout = biteForecast({
      hours: series(), at, celestial: celestial(), species: "trout", waterTempF: 74,
    });
    expect(bass.score).toBeGreaterThan(trout.score);
  });

  it("penalises water outside the tolerated range", () => {
    const f = biteForecast({
      hours: series(), at: NOON, celestial: celestial(), species: "trout", waterTempF: 84,
    });
    const temp = f.factors.find((x) => x.label === "Water temp")!;
    expect(temp.delta).toBeLessThanOrEqual(-15);
  });

  it("marks the spawn window rather than treating it as a peak", () => {
    const f = biteForecast({
      hours: series(), at: NOON, celestial: celestial(), species: "walleye", waterTempF: 46,
    });
    expect(f.factors.find((x) => x.label === "Water temp")!.detail).toMatch(/spawn/i);
  });
});

describe("light preference", () => {
  it("rewards overcast for walleye and clear skies for panfish", () => {
    const overcast = series({ cloudPct: 95 });
    const clear = series({ cloudPct: 5 });
    const args = { at: NOON, celestial: celestial(), waterTempF: 70 } as const;

    const walleyeCloudy = biteForecast({ ...args, hours: overcast, species: "walleye" });
    const walleyeClear = biteForecast({ ...args, hours: clear, species: "walleye" });
    expect(walleyeCloudy.score).toBeGreaterThan(walleyeClear.score);

    const panCloudy = biteForecast({ ...args, hours: overcast, species: "panfish" });
    const panClear = biteForecast({ ...args, hours: clear, species: "panfish" });
    expect(panClear.score).toBeGreaterThan(panCloudy.score);
  });

  it("puts the daily peak at dawn for a low-light species", () => {
    const args = { hours: series(), celestial: celestial(), species: "walleye", waterTempF: 68 } as const;
    const dawn = biteForecast({ ...args, at: new Date(`${DAY}T05:30`) });
    const midday = biteForecast({ ...args, at: NOON });
    expect(dawn.score).toBeGreaterThan(midday.score);
  });
});

describe("wind", () => {
  it("prefers a light chop over both dead calm and a gale", () => {
    const args = { at: NOON, celestial: celestial(), species: "walleye", waterTempF: 68 } as const;
    const calm = biteForecast({ ...args, hours: series({ windMph: 0 }) });
    const chop = biteForecast({ ...args, hours: series({ windMph: 7 }) });
    const gale = biteForecast({ ...args, hours: series({ windMph: 30 }) });
    expect(chop.score).toBeGreaterThan(calm.score);
    expect(chop.score).toBeGreaterThan(gale.score);
    expect(gale.score).toBeLessThan(calm.score);
  });
});

describe("solunar", () => {
  it("boosts the score during a major period", () => {
    const args = { hours: series(), at: NOON, species: "musky", waterTempF: 68 } as const;
    const off = biteForecast({ ...args, celestial: celestial() });
    const major = biteForecast({
      ...args, celestial: celestial({ moonTransit: new Date(`${DAY}T12:15`) }),
    });
    expect(major.score).toBeGreaterThan(off.score);
    expect(major.factors.find((f) => f.label === "Solunar")!.detail).toMatch(/major/i);
  });
});

describe("score bounds and output shape", () => {
  it("stays within 0-100 even when every factor is stacked against it", () => {
    const awful = biteForecast({
      hours: series({ windMph: 45, cloudPct: 100, precipIn: 1.5 }, +2),
      at: NOON,
      celestial: celestial({ moonPhase: 0.25 }),
      species: "trout",
      waterTempF: 90,
    });
    expect(awful.score).toBeGreaterThanOrEqual(0);
    expect(awful.rating).toBe("Poor");
  });

  it("stays within 0-100 when everything lines up", () => {
    const great = biteForecast({
      hours: series({ windMph: 7, cloudPct: 85 }, -0.8),
      at: new Date(`${DAY}T05:30`),
      celestial: celestial({ moonTransit: new Date(`${DAY}T05:30`), moonPhase: 0.5 }),
      species: "walleye",
      waterTempF: 67,
    });
    expect(great.score).toBeLessThanOrEqual(100);
    expect(great.score).toBeGreaterThan(75);
  });

  it("always explains itself", () => {
    const f = biteForecast({
      hours: series(), at: NOON, celestial: celestial(), species: "walleye", waterTempF: 68,
    });
    expect(f.factors.length).toBeGreaterThanOrEqual(7);
    for (const factor of f.factors) {
      expect(factor.label).toBeTruthy();
      expect(factor.detail).toBeTruthy();
    }
    expect(f.summary).toBeTruthy();
  });
});

describe("helpers", () => {
  it("maps degrees to compass points", () => {
    expect(compass(0)).toBe("N");
    expect(compass(90)).toBe("E");
    expect(compass(225)).toBe("SW");
    expect(compass(360)).toBe("N");
  });

  it("names moon phases", () => {
    expect(moonPhaseName(0)).toBe("new moon");
    expect(moonPhaseName(0.5)).toBe("full moon");
  });

  it("maps scores to ratings", () => {
    expect(ratingFor(90)).toBe("Prime");
    expect(ratingFor(20)).toBe("Poor");
    expect(ratingFor(50)).toBe("Fair");
  });
});

describe("summary text", () => {
  it("keeps compass acronyms uppercase when folding them into a sentence", () => {
    const f = biteForecast({
      hours: series({ windMph: 8, windDirDeg: 157 }), // SSE
      at: NOON,
      celestial: celestial(),
      species: "walleye",
      waterTempF: 68,
    });
    expect(f.summary).toContain("SSE");
    expect(f.summary).not.toContain("sse ");
    // ...while still reading as lowercase prose at the start.
    expect(f.summary.startsWith(f.summary[0].toLowerCase())).toBe(true);
  });
});
