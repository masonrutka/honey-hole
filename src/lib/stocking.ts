/**
 * DNR fish stocking history.
 *
 * Answers a question nothing else in the app can: is this fishery naturally
 * reproducing, or hatchery-maintained? A walleye lake stocked every other year
 * fishes differently from one that sustains itself -- year classes come in
 * pulses, and the fish run to predictable sizes.
 *
 * The DNR keys stocking by waterbody name and county rather than WBIC, so this
 * data is joined by name matching in ingest/06_stocking.py. That match runs at
 * about 89% on records that could match a named inland lake; the rest are
 * millponds, quarries and lake chains that are not in the lake dataset. A lake
 * showing no stocking may therefore mean "none recorded" rather than
 * "definitely never stocked", and the UI says so.
 */

import stockingData from "@/data/stocking.json";
import { SPECIES, type SpeciesKey } from "./species";

export interface StockingEvent {
  year: number;
  species: string;
  speciesKey: SpeciesKey | null;
  count: number | null;
  ageClass: string | null;
  avgLengthIn: number | null;
  source: string | null;
}

const STOCKING = stockingData as unknown as Record<string, StockingEvent[]>;

/** Every recorded stocking event for a lake, most recent first. */
export function getStocking(wbic: number): StockingEvent[] {
  return STOCKING[String(wbic)] ?? [];
}

export interface SpeciesStocking {
  speciesKey: SpeciesKey | null;
  species: string;
  /** Distinct years this species was stocked. */
  years: number[];
  totalFish: number;
  latestYear: number;
  /** The size class most often stocked, e.g. "Small Fingerling". */
  typicalAge: string | null;
}

/** Group a lake's stocking history by species. */
export function stockingBySpecies(wbic: number): SpeciesStocking[] {
  const events = getStocking(wbic);
  const groups = new Map<string, StockingEvent[]>();
  for (const e of events) {
    const key = e.speciesKey ?? e.species;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
  }

  const out: SpeciesStocking[] = [];
  for (const list of groups.values()) {
    const years = [...new Set(list.map((e) => e.year))].sort((a, b) => b - a);
    const ages = new Map<string, number>();
    for (const e of list) {
      if (e.ageClass) ages.set(e.ageClass, (ages.get(e.ageClass) ?? 0) + 1);
    }
    const typicalAge =
      [...ages.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    out.push({
      speciesKey: list[0].speciesKey,
      species: list[0].speciesKey
        ? SPECIES[list[0].speciesKey].name
        : list[0].species,
      years,
      totalFish: list.reduce((sum, e) => sum + (e.count ?? 0), 0),
      latestYear: years[0],
      typicalAge,
    });
  }

  // Most consistently stocked first; that is the species the lake is managed for.
  return out.sort(
    (a, b) => b.years.length - a.years.length || b.latestYear - a.latestYear,
  );
}

/**
 * A plain-language reading of what the stocking record implies.
 *
 * Deliberately hedged. Stocking does not prove an absence of natural
 * reproduction -- many waters are stocked to supplement it -- so this describes
 * the pattern and leaves the conclusion to the angler.
 */
/** Earliest year the stocking ingest pulls. Keep in step with 06_stocking.py. */
export const STOCKING_SINCE = 2015;

export function stockingNote(
  entry: SpeciesStocking,
  windowYears?: number,
): string {
  // Derive the window from the data rather than hardcoding it, or the phrasing
  // drifts as years pass ("13 of the last 12 years").
  const span =
    windowYears ??
    Math.max(1, new Date().getUTCFullYear() - STOCKING_SINCE + 1);
  const n = Math.min(entry.years.length, span);
  const fish = entry.totalFish.toLocaleString();
  const name = entry.species.toLowerCase();

  if (n >= Math.round(span * 0.7)) {
    return `Stocked in ${n} of the last ${span} years — this ${name} fishery is actively maintained, so expect consistent year classes.`;
  }
  if (n >= 3) {
    return `Stocked in ${n} of the last ${span} years (${fish} fish) — supplemented rather than sustained entirely by stocking.`;
  }
  return `Stocked in ${n === 1 ? "one year" : `${n} years`} of the last ${span} (${fish} fish) — occasional stocking only.`;
}
