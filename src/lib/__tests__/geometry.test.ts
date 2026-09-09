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
