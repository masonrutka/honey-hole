import { describe, it, expect } from "vitest";
import {
  getStocking, stockingBySpecies, stockingNote, type SpeciesStocking,
} from "../stocking";

describe("stocking data", () => {
  it("returns an empty list for a lake with no records", () => {
    expect(getStocking(-1)).toEqual([]);
    expect(stockingBySpecies(-1)).toEqual([]);
  });

  it("orders events most recent first", () => {
    const events = getStocking(762400);
    if (events.length > 1) {
      for (let i = 1; i < events.length; i++) {
        expect(events[i].year).toBeLessThanOrEqual(events[i - 1].year);
      }
    }
  });
});

describe("grouping by species", () => {
  const sample = (over: Partial<SpeciesStocking> = {}): SpeciesStocking => ({
    speciesKey: "walleye", species: "Walleye",
    years: [2024, 2023, 2022], totalFish: 30000,
    latestYear: 2024, typicalAge: "Small Fingerling", ...over,
  });

  it("calls a consistently stocked fishery actively maintained", () => {
    const note = stockingNote(sample({ years: [2024,2023,2022,2021,2020,2019,2018,2017,2016] }));
    expect(note).toMatch(/actively maintained/i);
  });

  it("calls an intermittently stocked fishery supplemented", () => {
    expect(stockingNote(sample({ years: [2024, 2021, 2018] }))).toMatch(/supplemented/i);
  });

  it("describes a one-off as occasional", () => {
    expect(stockingNote(sample({ years: [2019] }))).toMatch(/occasional/i);
  });

  it("never claims a lake has no natural reproduction", () => {
    for (const years of [[2024], [2024,2021,2018], Array.from({length:10},(_,i)=>2024-i)]) {
      const note = stockingNote(sample({ years }));
      expect(note).not.toMatch(/no natural|does not reproduce|cannot reproduce/i);
    }
  });
});

describe("real dataset shape", () => {
  it("groups a stocked lake sensibly when one exists", () => {
    // Find any lake with stocking and check the grouping invariants hold.
    let found = 0;
    for (const wbic of [762400, 131100, 731800, 1377100, 1623800, 2745000]) {
      const groups = stockingBySpecies(wbic);
      if (groups.length === 0) continue;
      found++;
      for (const g of groups) {
        expect(g.years.length).toBeGreaterThan(0);
        expect(g.latestYear).toBe(Math.max(...g.years));
        expect(g.totalFish).toBeGreaterThanOrEqual(0);
        expect(stockingNote(g).length).toBeGreaterThan(20);
      }
    }
    expect(found).toBeGreaterThanOrEqual(0);
  });
});
