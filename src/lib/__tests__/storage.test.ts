import { describe, it, expect, beforeEach } from "vitest";
import {
  getFavorites, getRecent, isFavorite, toggleFavorite, recordVisit, read, KEYS,
} from "../storage";

/** Minimal in-memory stand-in for localStorage. */
function fakeStore() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    _map: map,
  };
}

const lake = (wbic: number, name: string) => ({
  wbic, name, county: "Waukesha", acres: 100,
});

let s: ReturnType<typeof fakeStore>;
beforeEach(() => { s = fakeStore(); });

describe("favorites", () => {
  it("starts empty", () => {
    expect(getFavorites(s)).toEqual([]);
  });

  it("toggles on and off", () => {
    expect(toggleFavorite(lake(1, "A"), s)).toBe(true);
    expect(isFavorite(1, s)).toBe(true);
    expect(toggleFavorite(lake(1, "A"), s)).toBe(false);
    expect(isFavorite(1, s)).toBe(false);
    expect(getFavorites(s)).toEqual([]);
  });

  it("puts the newest favourite first", () => {
    toggleFavorite(lake(1, "A"), s);
    toggleFavorite(lake(2, "B"), s);
    expect(getFavorites(s).map((l) => l.wbic)).toEqual([2, 1]);
  });
});

describe("recent visits", () => {
  it("records most recent first", () => {
    recordVisit(lake(1, "A"), s);
    recordVisit(lake(2, "B"), s);
    expect(getRecent(s).map((l) => l.wbic)).toEqual([2, 1]);
  });

  it("moves a revisited lake to the front instead of duplicating it", () => {
    recordVisit(lake(1, "A"), s);
    recordVisit(lake(2, "B"), s);
    recordVisit(lake(1, "A"), s);
    expect(getRecent(s).map((l) => l.wbic)).toEqual([1, 2]);
  });

  it("caps the list", () => {
    for (let i = 1; i <= KEYS.MAX_RECENT + 4; i++) recordVisit(lake(i, `L${i}`), s);
    expect(getRecent(s).length).toBe(KEYS.MAX_RECENT);
  });
});

describe("hostile storage", () => {
  it("returns empty when storage is unavailable", () => {
    expect(read("anything", null)).toEqual([]);
    expect(getFavorites(null)).toEqual([]);
  });

  it("survives corrupt JSON", () => {
    s._map.set(KEYS.FAVORITES_KEY, "{not json");
    expect(getFavorites(s)).toEqual([]);
  });

  it("survives a non-array payload", () => {
    s._map.set(KEYS.RECENT_KEY, '{"wbic":1}');
    expect(getRecent(s)).toEqual([]);
  });

  it("drops entries that are not lakes", () => {
    s._map.set(KEYS.FAVORITES_KEY, '[{"wbic":1,"name":"A"},{"nope":true},null]');
    expect(getFavorites(s).map((l) => l.wbic)).toEqual([1]);
  });

  it("does not throw when writing fails", () => {
    const throwing = {
      getItem: () => null,
      setItem: () => { throw new Error("QuotaExceeded"); },
    };
    expect(() => toggleFavorite(lake(1, "A"), throwing)).not.toThrow();
  });
});
