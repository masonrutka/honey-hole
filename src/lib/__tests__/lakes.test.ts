import { describe, it, expect } from "vitest";
import {
  searchLakes,
  nearbyLakes,
  getLake,
  getRegulations,
  distanceMiles,
  totalLakes,
} from "../lakes";

// Big Muskego Lake -- verified against the DNR lake page during development.
const MUSKEGO_WBIC = 762400;

describe("dataset integrity", () => {
  it("ships a substantial number of lakes", () => {
    expect(totalLakes()).toBeGreaterThan(4000);
  });

  it("places every lake inside Wisconsin", () => {
    // A projection or centroid bug shows up here immediately.
    const sample = nearbyLakes(44.5, -89.5, 500, 0);
    for (const lake of sample) {
      expect(lake.lat, lake.name).toBeGreaterThan(42.4);
      expect(lake.lat, lake.name).toBeLessThan(47.4);
      expect(lake.lon, lake.name).toBeGreaterThan(-93.0);
      expect(lake.lon, lake.name).toBeLessThan(-86.7);
    }
  });

  it("matches the DNR's published acreage for a known lake", () => {
    const lake = getLake(MUSKEGO_WBIC);
    expect(lake).toBeDefined();
    // DNR lake page states "2194 acre lake".
    expect(Math.round(lake!.acres)).toBe(2194);
  });
});

describe("search", () => {
  it("ignores queries that are too short to be useful", () => {
    expect(searchLakes("a")).toEqual([]);
    expect(searchLakes("")).toEqual([]);
  });

  it("finds a lake by name", () => {
    const hits = searchLakes("muskego");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((l) => l.wbic === MUSKEGO_WBIC)).toBe(true);
  });

  it("ranks exact and prefix matches above substring matches", () => {
    const hits = searchLakes("winnebago");
    expect(hits[0].name.toLowerCase()).toContain("winnebago");
  });

  it("is case and punctuation insensitive", () => {
    const a = searchLakes("Lake Winnebago");
    const b = searchLakes("lake winnebago!!");
    expect(b.map((l) => l.wbic)).toEqual(a.map((l) => l.wbic));
  });
});

describe("proximity", () => {
  it("computes a sane distance between two known points", () => {
    // Milwaukee to Madison is roughly 65 miles.
    const d = distanceMiles(43.0389, -87.9065, 43.0731, -89.4012);
    expect(d).toBeGreaterThan(60);
    expect(d).toBeLessThan(85);
  });

  it("returns lakes ordered by increasing distance", () => {
    const near = nearbyLakes(42.9017, -88.1362, 10);
    expect(near.length).toBe(10);
    for (let i = 1; i < near.length; i++) {
      expect(near[i].distanceMi).toBeGreaterThanOrEqual(near[i - 1].distanceMi);
    }
  });

  it("puts Muskego-area water at the top when searching from Muskego", () => {
    const near = nearbyLakes(42.9017, -88.1362, 5);
    expect(near[0].distanceMi).toBeLessThan(5);
  });
});

describe("regulations", () => {
  it("returns per-species regulations for a lake that has them", () => {
    const regs = getRegulations(MUSKEGO_WBIC);
    expect(regs.length).toBeGreaterThan(5);
    for (const r of regs) {
      expect(r.speciesGroup).toBeTruthy();
      expect(r.text).toBeTruthy();
    }
  });

  it("returns an empty list rather than throwing for an unknown lake", () => {
    expect(getRegulations(-1)).toEqual([]);
  });
});
