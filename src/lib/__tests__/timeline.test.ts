import { describe, it, expect } from "vitest";
import { bestWindow, buildOutlook, type HourScore } from "../timeline";
import type { WeatherBundle } from "../weather";

const hour = (h: number, score: number): HourScore => ({
  time: new Date(Date.UTC(2026, 5, 15, h)),
  score,
});

describe("bestWindow", () => {
  it("returns null when nothing clears the floor", () => {
    // A flat, mediocre day has no window worth naming.
    expect(bestWindow([hour(6, 40), hour(7, 48), hour(8, 30)])).toBeNull();
  });

  it("does not call a single mediocre hour a window", () => {
    expect(bestWindow([hour(6, 20), hour(7, 54), hour(8, 22)])).toBeNull();
  });

  it("finds a single good stretch and closes it at the end of the last hour", () => {
    const w = bestWindow([hour(5, 40), hour(6, 70), hour(7, 75), hour(8, 40)])!;
    expect(w).not.toBeNull();
    expect(w.start.getUTCHours()).toBe(6);
    // 07:00 is the last good hour, so the window runs through 08:00.
    expect(w.end.getUTCHours()).toBe(8);
    expect(w.score).toBe(73);
  });

  it("narrows to the peak rather than spanning a uniformly good day", () => {
    // Every hour clears an absolute "good" bar, but only the evening is the
    // actual peak. Reporting 5am-9pm here would be useless.
    const w = bestWindow([
      hour(5, 62), hour(6, 63), hour(7, 64), hour(8, 63),
      hour(9, 62), hour(10, 61), hour(11, 62), hour(12, 63),
      hour(19, 88), hour(20, 90),
    ])!;
    expect(w.start.getUTCHours()).toBe(19);
    expect(w.end.getUTCHours()).toBe(21);
  });

  it("breaks length ties on the stronger average", () => {
    const w = bestWindow([
      hour(5, 80),
      hour(6, 81),
      hour(7, 40),
      hour(8, 84),
      hour(9, 85),
    ])!;
    expect(w.start.getUTCHours()).toBe(8);
  });

  it("handles an empty day", () => {
    expect(bestWindow([])).toBeNull();
  });
});

/** Minimal but realistic bundle: 10 days hourly, sun times, daily means. */
function bundle(): WeatherBundle {
  const start = Date.UTC(2026, 5, 8, 0);
  const hours = Array.from({ length: 24 * 12 }, (_, i) => ({
    time: new Date(start + i * 3_600_000).toISOString(),
    tempF: 70,
    pressureHpa: 1013 - i * 0.05,
    windMph: 7,
    windDirDeg: 200,
    cloudPct: 55,
    precipIn: 0,
  }));
  const sunrise: Date[] = [];
  const sunset: Date[] = [];
  for (let d = 0; d < 12; d++) {
    sunrise.push(new Date(start + d * 86_400_000 + 5.5 * 3_600_000));
    sunset.push(new Date(start + d * 86_400_000 + 20.5 * 3_600_000));
  }
  return {
    hours,
    dailyMeanAirF: Array.from({ length: 12 }, () => 68),
    timezone: "America/Chicago",
    utcOffsetSeconds: 0,
    sunrise,
    sunset,
    todayIndex: 7,
  };
}

describe("buildOutlook", () => {
  const lake = { acres: 500, maxDepthFt: 30 };
  // The fixture is a fixed date in the past, so these pass `null` for `now`
  // rather than having every hour filtered out as elapsed.

  it("produces one entry per requested day", () => {
    const out = buildOutlook(bundle(), lake, "walleye", 43.0, -89.0, 4, null);
    expect(out.length).toBe(4);
  });

  it("scores a full span of daytime hours for each day", () => {
    const out = buildOutlook(bundle(), lake, "walleye", 43.0, -89.0, 3, null);
    for (const day of out) {
      expect(day.hours.length).toBeGreaterThan(10);
      for (const h of day.hours) {
        expect(h.score).toBeGreaterThanOrEqual(0);
        expect(h.score).toBeLessThanOrEqual(100);
      }
      expect(day.peakScore).toBe(Math.max(...day.hours.map((h) => h.score)));
    }
  });

  it("never asks for more days than the weather data covers", () => {
    const out = buildOutlook(bundle(), lake, "walleye", 43.0, -89.0, 99, null);
    expect(out.length).toBeLessThanOrEqual(5);
  });

  it("flags a flat, uniformly good day instead of inventing a window", () => {
    const out = buildOutlook(bundle(), lake, "panfish", 43.0, -89.0, 1, null);
    const day = out[0];
    // Either it found a real window, or it said the whole day is good --
    // it must never report a "window" covering nearly all of it.
    if (day.best && !day.goodAllDay) {
      const covered = day.hours.filter(
        (h) => h.time >= day.best!.start && h.time < day.best!.end,
      ).length;
      expect(covered / day.hours.length).toBeLessThan(0.7);
    }
    expect(typeof day.goodAllDay).toBe("boolean");
  });

  it("peaks around dawn or dusk for a low-light species", () => {
    const out = buildOutlook(bundle(), lake, "walleye", 43.0, -89.0, 1, null);
    const day = out[0];
    const peak = day.hours.find((h) => h.score === day.peakScore)!;
    const h = peak.time.getUTCHours();
    // Sunrise 05:30, sunset 20:30 in this fixture.
    expect(h <= 8 || h >= 18).toBe(true);
  });
});

describe("elapsed hours", () => {
  it("drops hours that have already passed today", () => {
    const b = bundle();
    // 14:00 UTC on the fixture's "today" (offset 0).
    const now = new Date(Date.UTC(2026, 5, 15, 14));
    const out = buildOutlook(b, { acres: 500, maxDepthFt: 30 }, "walleye", 43, -89, 2, now);
    const today = out[0];
    for (const h of today.hours) {
      expect(h.time.getTime() + 3_600_000).toBeGreaterThan(now.getTime());
    }
  });

  it("keeps the whole day when no clock is supplied", () => {
    const b = bundle();
    const withNow = buildOutlook(b, { acres: 500 }, "walleye", 43, -89, 1,
      new Date(Date.UTC(2026, 5, 15, 18)));
    const without = buildOutlook(b, { acres: 500 }, "walleye", 43, -89, 1, null);
    expect(without[0].hours.length).toBeGreaterThan(withNow[0].hours.length);
  });
});
