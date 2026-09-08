import { describe, it, expect } from "vitest";
import { suggestBaits, seasonFor, skyFor, windBandFor } from "../bait";
import { ALL_SPECIES } from "../species";

describe("season classification", () => {
  it("calls hard water in January ice", () => {
    expect(seasonFor(1, 34)).toBe("ice");
  });
  it("does not call 34F in July ice", () => {
    expect(seasonFor(7, 34)).not.toBe("ice");
  });
  it("calls warm July water summer", () => {
    expect(seasonFor(7, 76)).toBe("summer");
  });
  it("calls cooling October water fall", () => {
    expect(seasonFor(10, 58)).toBe("fall");
  });
});

describe("condition banding", () => {
  it("bands sky cover", () => {
    expect(skyFor(5)).toBe("clear");
    expect(skyFor(50)).toBe("mixed");
    expect(skyFor(90)).toBe("overcast");
  });
  it("bands wind speed", () => {
    expect(windBandFor(1)).toBe("calm");
    expect(windBandFor(7)).toBe("light");
    expect(windBandFor(14)).toBe("moderate");
    expect(windBandFor(25)).toBe("strong");
  });
});

describe("bait suggestions", () => {
  it("never returns an empty list for any species in any season", () => {
    for (const profile of ALL_SPECIES) {
      for (const month of [1, 4, 7, 10]) {
        for (const waterTempF of [34, 52, 74]) {
          const out = suggestBaits({
            species: profile.key, waterTempF, month, sky: "mixed", wind: "light",
          });
          expect(out.length, `${profile.key} m${month} ${waterTempF}F`).toBeGreaterThan(0);
        }
      }
    }
  });

  it("always explains every suggestion", () => {
    const out = suggestBaits({
      species: "walleye", waterTempF: 68, month: 7, sky: "overcast", wind: "light",
    });
    for (const s of out) {
      expect(s.why.length).toBeGreaterThan(20);
      expect(s.presentation).toBeTruthy();
      expect(s.confidence).toBeGreaterThan(0);
      expect(s.confidence).toBeLessThanOrEqual(1);
    }
  });

  it("moves trolling up the list for walleye when it blows", () => {
    const base = { species: "walleye", waterTempF: 70, month: 7, sky: "mixed" } as const;
    const windy = suggestBaits({ ...base, wind: "strong" });
    const calm = suggestBaits({ ...base, wind: "calm" });
    const rankOf = (list: typeof windy) =>
      list.findIndex((s) => /troll/i.test(s.presentation));
    expect(rankOf(windy)).toBeGreaterThanOrEqual(0);
    expect(rankOf(windy)).toBeLessThan(rankOf(calm) === -1 ? 99 : rankOf(calm) + 1);
  });

  it("suggests ice tactics on hard water, not summer ones", () => {
    const out = suggestBaits({
      species: "panfish", waterTempF: 34, month: 1, sky: "clear", wind: "calm",
    });
    expect(out[0].depth + out[0].detail).toMatch(/tungsten|basin/i);
  });

  it("leads with the regulation warning for sturgeon", () => {
    const out = suggestBaits({
      species: "sturgeon", waterTempF: 60, month: 6, sky: "mixed", wind: "light",
    });
    expect(out[0].presentation).toMatch(/regulation/i);
  });
});
