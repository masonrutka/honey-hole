/**
 * Bait and presentation suggestions.
 *
 * Rules live in code rather than a database table: they are small, they change
 * with judgement rather than with data, and keeping them here means they are
 * type-checked, diffable in review and unit-testable.
 *
 * Every suggestion carries a `why`. A recommendation an angler cannot evaluate
 * is worth nothing -- showing the reasoning lets them disagree with it.
 */

import { SPECIES, type SpeciesKey } from "./species";

export type Season = "ice" | "early_spring" | "spawn" | "summer" | "fall";
export type Sky = "clear" | "mixed" | "overcast";
export type WindBand = "calm" | "light" | "moderate" | "strong";

export interface BaitConditions {
  species: SpeciesKey;
  waterTempF: number;
  month: number; // 1-12
  sky: Sky;
  wind: WindBand;
}

export interface BaitRule {
  species: SpeciesKey[];
  seasons?: Season[];
  waterTempF?: [number, number];
  sky?: Sky[];
  wind?: WindBand[];
  presentation: string;
  detail: string;
  depth: string;
  why: string;
  /** Baseline confidence 0-1 before condition bonuses. */
  weight: number;
}

export interface BaitSuggestion {
  presentation: string;
  detail: string;
  depth: string;
  why: string;
  confidence: number;
}

export function seasonFor(month: number, waterTempF: number): Season {
  if (waterTempF <= 39 && (month === 12 || month <= 3)) return "ice";
  if (waterTempF < 50) return "early_spring";
  if (month >= 9 && month <= 11 && waterTempF < 68) return "fall";
  if (waterTempF >= 68) return "summer";
  return "spawn";
}

export function skyFor(cloudPct: number): Sky {
  if (cloudPct >= 70) return "overcast";
  if (cloudPct >= 30) return "mixed";
  return "clear";
}

export function windBandFor(mph: number): WindBand {
  if (mph <= 2) return "calm";
  if (mph <= 10) return "light";
  if (mph <= 18) return "moderate";
  return "strong";
}

const RULES: BaitRule[] = [
  // --- Walleye -------------------------------------------------------------
  {
    species: ["walleye"],
    seasons: ["early_spring"],
    presentation: "Jig and minnow",
    detail: "1/8–1/4 oz jig, fathead or shiner. Chartreuse, orange or plain lead.",
    depth: "6–15 ft, near spawning gravel and river mouths",
    why: "Cold water means slow metabolism — a vertical jig they barely have to chase is the highest-percentage bait.",
    weight: 0.9,
  },
  {
    species: ["walleye"],
    seasons: ["summer"],
    sky: ["overcast", "mixed"],
    presentation: "Lindy rig or slow-death crawler",
    detail: "Live nightcrawler or leech on a slow-death hook, 1/2–1 oz walking sinker.",
    depth: "12–25 ft along breaklines and points",
    why: "Warm water fish hold on structure edges; a dragged livebait rig covers water without outrunning them.",
    weight: 0.85,
  },
  {
    species: ["walleye"],
    seasons: ["summer", "fall"],
    wind: ["moderate", "strong"],
    presentation: "Crankbait trolling on the windblown shore",
    detail: "Shad-profile crankbaits, natural perch or firetiger. 1.5–2.2 mph.",
    depth: "8–18 ft over the wind-hit side",
    why: "Wind stacks plankton and baitfish against the shore and puts a chop overhead — walleye feed hard and shallow in it.",
    weight: 0.9,
  },
  {
    species: ["walleye"],
    seasons: ["fall"],
    presentation: "Large shiner on a slip bobber or jig",
    detail: "4–6 in redtail chub or shiner, 1/4 oz jig.",
    depth: "10–22 ft on sharp breaks and rock",
    why: "Pre-winter walleye want one big meal, not many small ones. Size up your bait in the fall.",
    weight: 0.85,
  },
  {
    species: ["walleye"],
    seasons: ["ice"],
    presentation: "Jigging spoon and a deadstick",
    detail: "1/8–1/4 oz flutter spoon tipped with a minnow head; deadstick a live minnow nearby.",
    depth: "15–30 ft, first and last hour of light",
    why: "The spoon calls them in, the quiet deadstick catches the ones that will not commit to it.",
    weight: 0.85,
  },

  // --- Largemouth bass -----------------------------------------------------
  {
    species: ["largemouth_bass"],
    seasons: ["spawn"],
    presentation: "Soft plastic creature bait or wacky worm",
    detail: "Texas-rigged craw or 5 in senko, green pumpkin. Light weight, slow fall.",
    depth: "2–8 ft on flats and bedding areas",
    why: "Bedding bass strike out of aggression, not hunger — put something slow directly in their space.",
    weight: 0.85,
  },
  {
    species: ["largemouth_bass"],
    seasons: ["summer"],
    sky: ["overcast"],
    presentation: "Spinnerbait or chatterbait",
    detail: "3/8 oz white or white-chartreuse, willow blades.",
    depth: "3–10 ft along weed edges and wood",
    why: "Low light lets bass roam off cover to hunt, and a moving bait covers the water to find them.",
    weight: 0.9,
  },
  {
    species: ["largemouth_bass"],
    seasons: ["summer"],
    sky: ["clear"],
    presentation: "Texas-rigged worm or jig, punched into cover",
    detail: "3/8–1/2 oz jig with a craw trailer, or a 7 in worm. Dark colours.",
    depth: "Tight to docks, mats and thick weeds",
    why: "Bright sun pins bass hard against shade — you have to put the bait inside the cover, not near it.",
    weight: 0.85,
  },
  {
    species: ["largemouth_bass"],
    seasons: ["summer"],
    presentation: "Topwater frog or walking bait",
    detail: "Hollow-body frog over slop; spook-style walker on open water.",
    depth: "Surface, first and last hour of light",
    why: "Warm water means an aggressive, upward-looking fish — and nothing else is this much fun.",
    weight: 0.75,
  },
  {
    species: ["largemouth_bass"],
    seasons: ["fall"],
    presentation: "Lipless crankbait or squarebill",
    detail: "1/2 oz lipless in red craw or shad; squarebill for banging cover.",
    depth: "4–12 ft on flats near deep water",
    why: "Autumn bass follow baitfish schools onto flats and feed heavily before winter — match the shad and move fast.",
    weight: 0.85,
  },

  // --- Smallmouth bass -----------------------------------------------------
  {
    species: ["smallmouth_bass"],
    seasons: ["spawn", "summer"],
    presentation: "Ned rig or tube jig",
    detail: "1/6 oz Ned head with a 2.75 in stick, or a 3 in tube. Green pumpkin, smoke.",
    depth: "8–20 ft over rock, gravel and sand transitions",
    why: "Smallmouth live on crayfish. A subtle bottom-hugging plastic imitates one better than anything else.",
    weight: 0.9,
  },
  {
    species: ["smallmouth_bass"],
    seasons: ["summer", "fall"],
    wind: ["moderate", "strong"],
    presentation: "Drop shot or jerkbait on windblown rock",
    detail: "3/16 oz drop shot with a 4 in minnow bait; suspending jerkbait on a pause.",
    depth: "10–25 ft on points and reefs",
    why: "Wind on a rock point is the single best smallmouth pattern there is — it disorients bait and they gorge.",
    weight: 0.9,
  },

  // --- Northern pike -------------------------------------------------------
  {
    species: ["northern_pike"],
    seasons: ["early_spring", "spawn"],
    presentation: "Large spoon or spinnerbait",
    detail: "1/2–1 oz red-and-white or gold spoon; retrieve slow and steady.",
    depth: "2–8 ft in warming shallow bays",
    why: "Pike spawn earliest of anything in the lake and sit in the warmest shallow water they can find.",
    weight: 0.9,
  },
  {
    species: ["northern_pike"],
    seasons: ["summer", "fall"],
    presentation: "Bucktail, big swimbait or a sucker under a float",
    detail: "Large profile baits. Always use a steel or heavy fluorocarbon leader.",
    depth: "6–18 ft along deep weed edges",
    why: "Pike are ambush hunters that hold on the weed line and want a big, obvious target. A leader is not optional — they will bite through mono.",
    weight: 0.85,
  },

  // --- Musky ---------------------------------------------------------------
  {
    species: ["musky"],
    seasons: ["summer"],
    presentation: "Bucktail or topwater",
    detail: "Double-10 bucktail burned fast; walk-the-dog topwater at low light.",
    depth: "Weed edges and over deep cabbage",
    why: "Warm water is when a musky will chase a fast bait — speed triggers reaction strikes from following fish.",
    weight: 0.8,
  },
  {
    species: ["musky"],
    seasons: ["fall"],
    presentation: "Large rubber or a live sucker",
    detail: "Magnum rubber baits worked slow, or a quick-strike-rigged sucker.",
    depth: "10–25 ft near deep structure",
    why: "Cold-water muskies will not chase, but they will eat one very large, very slow meal.",
    weight: 0.85,
  },

  // --- Panfish -------------------------------------------------------------
  {
    species: ["panfish"],
    seasons: ["spawn"],
    presentation: "Small jig or worm under a slip bobber",
    detail: "1/32 oz jig tipped with a waxworm or a piece of crawler.",
    depth: "2–6 ft over bedding colonies",
    why: "Bedding bluegill are shallow, concentrated and aggressive — the easiest reliable fishing of the year.",
    weight: 0.95,
  },
  {
    species: ["panfish"],
    seasons: ["summer"],
    presentation: "Small jig along the weed edge",
    detail: "1/32–1/16 oz jig, plastic or livebait. Crappie hold higher than bluegill.",
    depth: "6–14 ft along cabbage and coontail edges",
    why: "Summer panfish push out to the first weed edge where there is shade and bait.",
    weight: 0.85,
  },
  {
    species: ["panfish"],
    seasons: ["ice"],
    presentation: "Tungsten jig with a plastic or spike",
    detail: "1/32–1/16 oz tungsten. Watch the flasher and match their mood.",
    depth: "Basin holes in 15–30 ft",
    why: "Winter panfish suspend over deep basins; tungsten drops fast so you spend more time in front of them.",
    weight: 0.9,
  },

  // --- Yellow perch --------------------------------------------------------
  {
    species: ["yellow_perch"],
    presentation: "Small jig with a minnow head or a crawler piece",
    detail: "1/16 oz jig fished right on the bottom.",
    depth: "10–25 ft over sand and gravel",
    why: "Perch feed on the bottom in schools. Find one and stay put — where there is one, there are usually fifty.",
    weight: 0.85,
  },

  // --- Trout ---------------------------------------------------------------
  {
    species: ["trout"],
    seasons: ["early_spring", "fall"],
    presentation: "Small spinner or spoon",
    detail: "1/8 oz inline spinner, silver or gold. Fish it across the current.",
    depth: "Shallow, near inlets and current",
    why: "Cool oxygenated water keeps trout shallow and willing to chase a flashy bait.",
    weight: 0.85,
  },
  {
    species: ["trout"],
    seasons: ["summer"],
    presentation: "Troll deep or fish the thermocline",
    detail: "Downrigger or leadcore with a spoon; find 55–60°F water.",
    depth: "Whatever depth holds 55–60°F",
    why: "Once the surface warms past the mid-60s trout retreat to the coldest oxygenated layer and stay there.",
    weight: 0.8,
  },

  // --- Catfish -------------------------------------------------------------
  {
    species: ["catfish"],
    seasons: ["summer"],
    presentation: "Cut bait or stinkbait on the bottom",
    detail: "Cut sucker, chicken liver or prepared bait on a slip sinker rig.",
    depth: "Deep holes and channel edges, after dark",
    why: "Catfish hunt by scent, not sight, so warm nights and a smelly bait beat any lure.",
    weight: 0.9,
  },

  // --- Sturgeon ------------------------------------------------------------
  {
    species: ["sturgeon"],
    presentation: "Check the regulations before targeting",
    detail: "Lake sturgeon are tightly managed with limited seasons and tag requirements.",
    depth: "n/a",
    why: "Wisconsin sturgeon are a conservation success story built on strict rules — confirm the season and tags for this water first.",
    weight: 1,
  },
];

/** Suggestions for the current conditions, best first. */
export function suggestBaits(c: BaitConditions, limit = 4): BaitSuggestion[] {
  const season = seasonFor(c.month, c.waterTempF);
  const profile = SPECIES[c.species];

  const scored = RULES.filter((r) => r.species.includes(c.species)).map((rule) => {
    let score = rule.weight;
    let matched = true;

    if (rule.seasons) {
      if (rule.seasons.includes(season)) score += 0.35;
      else matched = false;
    }
    if (rule.sky) {
      if (rule.sky.includes(c.sky)) score += 0.2;
      else score -= 0.15;
    }
    if (rule.wind) {
      if (rule.wind.includes(c.wind)) score += 0.2;
      else score -= 0.15;
    }
    if (rule.waterTempF) {
      const [lo, hi] = rule.waterTempF;
      if (c.waterTempF < lo || c.waterTempF > hi) matched = false;
    }
    return { rule, score, matched };
  });

  const usable = scored.filter((s) => s.matched);
  // If nothing matches the season exactly, fall back to the species' general
  // rules rather than showing an empty list.
  const pool = usable.length > 0 ? usable : scored;

  return pool
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ rule, score }) => ({
      presentation: rule.presentation,
      detail: rule.detail,
      depth: rule.depth,
      why: rule.why,
      confidence: Math.max(0.2, Math.min(1, score / 1.5)),
    }))
    .concat(
      // A quiet nudge toward the species' overall behaviour, always last.
      [] as BaitSuggestion[],
    )
    .map((s) => ({ ...s, why: s.why || profile.blurb }));
}
