/**
 * Behavioural profiles for Wisconsin gamefish.
 *
 * These drive the bite forecast and bait engine. Numbers come from published
 * WDNR fisheries guidance and widely-agreed angling references -- they are
 * informed heuristics, not laboratory constants, and the UI presents them
 * that way.
 */

export type SpeciesKey =
  | "walleye"
  | "largemouth_bass"
  | "smallmouth_bass"
  | "northern_pike"
  | "musky"
  | "panfish"
  | "yellow_perch"
  | "trout"
  | "catfish"
  | "sturgeon";

/** How strongly a species favours low light. Drives cloud + dawn/dusk weighting. */
export type LightPreference = "low" | "moderate" | "bright";

export interface SpeciesProfile {
  key: SpeciesKey;
  name: string;
  /** Water temps (°F) where the fish feeds hardest. */
  optimalTempF: [number, number];
  /** Outside this range the fish is lethargic or shut down. */
  toleratedTempF: [number, number];
  /** Surface temp (°F) that triggers spawning; fish are hard to pattern then. */
  spawnTempF: [number, number];
  light: LightPreference;
  /** Names as they appear in WDNR lake pages, for matching our scraped data. */
  dnrAliases: string[];
  blurb: string;
}

export const SPECIES: Record<SpeciesKey, SpeciesProfile> = {
  walleye: {
    key: "walleye",
    name: "Walleye",
    optimalTempF: [62, 72],
    toleratedTempF: [38, 80],
    spawnTempF: [42, 50],
    light: "low",
    dnrAliases: ["Walleye"],
    blurb:
      "Light-sensitive eyes give walleye an edge at dawn, dusk and under chop. Bright calm days push them deep.",
  },
  largemouth_bass: {
    key: "largemouth_bass",
    name: "Largemouth Bass",
    optimalTempF: [68, 82],
    toleratedTempF: [45, 90],
    spawnTempF: [60, 70],
    light: "moderate",
    dnrAliases: ["Largemouth Bass"],
    blurb:
      "Ambush predators tight to weeds, wood and docks. Warm, stable, slightly overcast days are prime.",
  },
  smallmouth_bass: {
    key: "smallmouth_bass",
    name: "Smallmouth Bass",
    optimalTempF: [65, 78],
    toleratedTempF: [45, 85],
    spawnTempF: [55, 65],
    light: "moderate",
    dnrAliases: ["Smallmouth Bass"],
    blurb:
      "Rock, gravel and current. More wind-tolerant than largemouth and often feeds hardest on a breezy point.",
  },
  northern_pike: {
    key: "northern_pike",
    name: "Northern Pike",
    optimalTempF: [55, 70],
    toleratedTempF: [35, 80],
    spawnTempF: [40, 52],
    light: "moderate",
    dnrAliases: ["Northern Pike", "Pike"],
    blurb:
      "Cool-water ambusher on weed edges. Stays active in cold water when most species slow down.",
  },
  musky: {
    key: "musky",
    name: "Musky",
    optimalTempF: [60, 75],
    toleratedTempF: [40, 82],
    spawnTempF: [49, 59],
    light: "low",
    dnrAliases: ["Musky", "Muskellunge", "Muskie"],
    blurb:
      "The fish of 10,000 casts. Low light, falling pressure and a moon period are when the odds actually move.",
  },
  panfish: {
    key: "panfish",
    name: "Panfish",
    optimalTempF: [65, 80],
    toleratedTempF: [38, 88],
    spawnTempF: [65, 75],
    light: "bright",
    dnrAliases: ["Panfish", "Bluegill", "Crappie", "Crappies", "Sunfish"],
    blurb:
      "Bluegill, crappie and sunfish. Forgiving and active through the middle of the day, which makes them the reliable fallback.",
  },
  yellow_perch: {
    key: "yellow_perch",
    name: "Yellow Perch",
    optimalTempF: [58, 72],
    toleratedTempF: [35, 80],
    spawnTempF: [45, 52],
    light: "bright",
    dnrAliases: ["Yellow Perch", "Perch"],
    blurb:
      "Schooling bottom-feeder. Daytime biters -- find one and there are usually plenty more.",
  },
  catfish: {
    key: "catfish",
    name: "Catfish",
    optimalTempF: [70, 85],
    toleratedTempF: [45, 92],
    spawnTempF: [70, 80],
    light: "low",
    dnrAliases: ["Catfish", "Channel Catfish", "Flathead Catfish"],
    blurb:
      "Scent-driven night feeder. Warm summer nights after a rain are the classic window.",
  },
  sturgeon: {
    key: "sturgeon",
    name: "Lake Sturgeon",
    optimalTempF: [55, 70],
    toleratedTempF: [35, 78],
    spawnTempF: [53, 60],
    light: "moderate",
    dnrAliases: ["Sturgeon", "Lake Sturgeon"],
    blurb:
      "A living fossil and a Wisconsin icon. Tightly regulated \u2014 check the season and tag rules before targeting them.",
  },
  trout: {
    key: "trout",
    name: "Trout",
    optimalTempF: [50, 65],
    toleratedTempF: [33, 72],
    spawnTempF: [44, 52],
    light: "low",
    dnrAliases: ["Trout", "Brook Trout", "Brown Trout", "Rainbow Trout", "Lake Trout"],
    blurb:
      "Cold-water specialist. Needs oxygen-rich water; goes deep or dormant once the surface warms past the mid-60s.",
  },
};

export const ALL_SPECIES: SpeciesProfile[] = Object.values(SPECIES);

/** Map a WDNR lake-page species string onto one of our profiles. */
export function matchSpecies(dnrName: string): SpeciesKey | null {
  const needle = dnrName.trim().toLowerCase();
  for (const profile of ALL_SPECIES) {
    if (profile.dnrAliases.some((a) => a.toLowerCase() === needle)) return profile.key;
  }
  // Fall back to substring matching: "Largemouth Bass (stocked)" and friends.
  for (const profile of ALL_SPECIES) {
    if (profile.dnrAliases.some((a) => needle.includes(a.toLowerCase()))) {
      return profile.key;
    }
  }
  return null;
}
