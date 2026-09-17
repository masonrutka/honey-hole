import { describe, expect, it } from "vitest";

import { reconcileWaterTemp, tempLabel } from "../watertemp";

const NOW = new Date("2026-09-14T18:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

describe("reconcileWaterTemp", () => {
  it("falls back to the estimate when nothing has been reported", () => {
    expect(reconcileWaterTemp(64, null, NOW)).toEqual({
      tempF: 64, source: "estimated", ageHours: null,
    });
  });

  it("ignores a report that carries no temperature", () => {
    const r = reconcileWaterTemp(64, { surfaceTempF: null, observedAt: hoursAgo(1) }, NOW);
    expect(r.source).toBe("estimated");
  });

  it("takes a fresh reading at face value", () => {
    const r = reconcileWaterTemp(64, { surfaceTempF: 71, observedAt: hoursAgo(3) }, NOW);
    expect(r.tempF).toBe(71);
    expect(r.source).toBe("reported");
  });

  it("still trusts a reading exactly at the full-trust boundary", () => {
    const r = reconcileWaterTemp(64, { surfaceTempF: 71, observedAt: hoursAgo(24) }, NOW);
    expect(r.source).toBe("reported");
  });

  it("blends between the boundaries, nearer the reading early on", () => {
    const early = reconcileWaterTemp(60, { surfaceTempF: 70, observedAt: hoursAgo(30) }, NOW);
    const late = reconcileWaterTemp(60, { surfaceTempF: 70, observedAt: hoursAgo(110) }, NOW);
    expect(early.source).toBe("blended");
    expect(early.tempF).toBeGreaterThan(late.tempF);
    expect(early.tempF).toBeLessThan(70);
    expect(late.tempF).toBeGreaterThan(60);
  });

  it("discards a reading once it is stale", () => {
    const r = reconcileWaterTemp(64, { surfaceTempF: 71, observedAt: hoursAgo(24 * 5) }, NOW);
    expect(r).toEqual({ tempF: 64, source: "estimated", ageHours: null });
  });

  it("treats slight clock skew as now, and wild future timestamps as unusable", () => {
    const skewed = reconcileWaterTemp(64, { surfaceTempF: 71, observedAt: hoursAgo(-0.5) }, NOW);
    expect(skewed.source).toBe("reported");
    expect(skewed.ageHours).toBe(0);

    const absurd = reconcileWaterTemp(64, { surfaceTempF: 71, observedAt: hoursAgo(-48) }, NOW);
    expect(absurd.source).toBe("estimated");
  });

  it("survives an unparseable timestamp rather than producing NaN", () => {
    const r = reconcileWaterTemp(64, { surfaceTempF: 71, observedAt: "not a date" }, NOW);
    expect(r.source).toBe("estimated");
    expect(Number.isFinite(r.tempF)).toBe(true);
  });

  it("never labels a blended or estimated number as reported", () => {
    expect(tempLabel("reported")).toContain("reported");
    expect(tempLabel("estimated")).toContain("est.");
    expect(tempLabel("blended")).toContain("est.");
  });
});
