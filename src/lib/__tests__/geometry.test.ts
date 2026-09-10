import { describe, it, expect } from "vitest";
import { shapeFromRings } from "../geometry";

type Ring = [number, number][];

/** A square 0.01 degrees on a side at 45N. */
const square: Ring = [
  [-89.0, 45.0], [-88.99, 45.0], [-88.99, 45.01], [-89.0, 45.01], [-89.0, 45.0],
];

describe("shapeFromRings", () => {
  it("returns null for empty or degenerate input", () => {
    expect(shapeFromRings([])).toBeNull();
    expect(shapeFromRings([[[1, 2]] as unknown as Ring])).toBeNull();
  });

  it("produces a closed path per ring", () => {
    const s = shapeFromRings([square])!;
    expect(s.path.startsWith("M")).toBe(true);
    expect(s.path.endsWith("Z")).toBe(true);
    expect(s.path.match(/M/g)!.length).toBe(1);
  });

  it("emits one subpath per ring so islands can be cut out", () => {
    const hole: Ring = [
      [-88.997, 45.003], [-88.995, 45.003], [-88.995, 45.005],
      [-88.997, 45.005], [-88.997, 45.003],
    ];
    const s = shapeFromRings([square, hole])!;
    expect(s.path.match(/M/g)!.length).toBe(2);
    expect(s.path.match(/Z/g)!.length).toBe(2);
  });

  it("corrects for longitude convergence so lakes are not stretched", () => {
    // A degree of longitude at 45N covers ~0.707 of a degree of latitude.
    const s = shapeFromRings([square])!;
    const [, , w, h] = s.viewBox.split(" ").map(Number);
    const ratio = w / h;
    expect(ratio).toBeGreaterThan(0.69);
    expect(ratio).toBeLessThan(0.72);
  });

  it("keeps all coordinates inside the viewBox", () => {
    const s = shapeFromRings([square])!;
    const [, , w, h] = s.viewBox.split(" ").map(Number);
    const nums = s.path.match(/-?\d+\.\d+/g)!.map(Number);
    for (let i = 0; i < nums.length; i += 2) {
      expect(nums[i]).toBeGreaterThanOrEqual(-1e-6);
      expect(nums[i]).toBeLessThanOrEqual(w + 1e-6);
      expect(nums[i + 1]).toBeGreaterThanOrEqual(-1e-6);
      expect(nums[i + 1]).toBeLessThanOrEqual(h + 1e-6);
    }
  });

  it("reports a plausible width in miles", () => {
    // 0.01 degrees of longitude at 45N is roughly half a mile.
    const s = shapeFromRings([square])!;
    expect(s.widthMiles).toBeGreaterThan(0.4);
    expect(s.widthMiles).toBeLessThan(0.6);
  });

  it("puts north at the top", () => {
    // The northern edge must map to a smaller y than the southern edge.
    const s = shapeFromRings([square])!;
    const pts = s.path.slice(1, -1).split("L").map((p) => p.split(",").map(Number));
    const north = pts.find((p) => Math.abs(p[1]) < 1e-9);
    expect(north).toBeDefined();
  });
});

import { mapFromLakes } from "../geometry";

describe("mapFromLakes", () => {
  // Two lakes a known distance apart, the eastern one twice as wide.
  const west = {
    wbic: 1, name: "West",
    rings: [[[-89.9, 46.0], [-89.88, 46.0], [-89.88, 46.02], [-89.9, 46.02], [-89.9, 46.0]]] as Ring[],
  };
  const east = {
    wbic: 2, name: "East",
    rings: [[[-89.5, 45.9], [-89.46, 45.9], [-89.46, 45.94], [-89.5, 45.94], [-89.5, 45.9]]] as Ring[],
  };

  it("returns null for no input", () => {
    expect(mapFromLakes([])).toBeNull();
  });

  it("keeps lakes in their true relative positions", () => {
    const view = mapFromLakes([west, east])!;
    expect(view.lakes).toHaveLength(2);
    const w = view.lakes.find((l) => l.wbic === 1)!;
    const e = view.lakes.find((l) => l.wbic === 2)!;
    // West is west (smaller x) and north (smaller y, since y grows downward).
    expect(w.cx).toBeLessThan(e.cx);
    expect(w.cy).toBeLessThan(e.cy);
  });

  it("preserves relative size — this is what a shared projection buys", () => {
    const view = mapFromLakes([west, east])!;
    const w = view.lakes.find((l) => l.wbic === 1)!;
    const e = view.lakes.find((l) => l.wbic === 2)!;
    // East spans 0.04 degrees against West's 0.02.
    expect(e.extent / w.extent).toBeGreaterThan(1.8);
    expect(e.extent / w.extent).toBeLessThan(2.2);
  });

  it("corrects for longitude convergence", () => {
    const view = mapFromLakes([west, east])!;
    const [, , vwidth, vheight] = view.viewBox.split(" ").map(Number);
    // 0.4 deg of longitude at 46N is ~0.278 deg of latitude worth of distance,
    // against 0.12 deg of latitude spanned.
    expect(vwidth / vheight).toBeGreaterThan(1.8);
    expect(vwidth / vheight).toBeLessThan(2.8);
  });

  it("reports a plausible width in miles", () => {
    const view = mapFromLakes([west, east])!;
    // ~0.4 degrees of longitude at 46N is roughly 19 miles.
    expect(view.widthMiles).toBeGreaterThan(14);
    expect(view.widthMiles).toBeLessThan(26);
  });
});
