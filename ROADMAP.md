# Roadmap

Written 2026-09-08, just after the first deploy to
[honey-hole-one.vercel.app](https://honey-hole-one.vercel.app).

Ordered by what actually makes the app better, not by what is fun to build.

---

## Horizon 1 — finish the lake app  ·  COMPLETE

All four shipped. The lake side is done and worth leaving alone; the next real
work is Horizon 2.

### 1. Forecast timeline  ·  DONE 2026-09-08
~~**The biggest remaining gap.**~~ The app answers "how is it right now" but not
"when should I go" — and the second question is the one anglers actually ask.
You check a fishing app on Wednesday to plan Saturday.

Cheap to build: the hourly weather is already fetched (bump `forecast_days`)
and `biteForecast()` is a pure function of a timestamp, so scoring the next
week is a loop over code that already exists. No new dependencies.

Delivers two things: **best windows today** and **best day this week**.

### 2. Recalibrate the bite score  ·  DONE, validated 2026-09-09
The first weighting let positive factors sum to +79 against a baseline of 50,
so any decent evening pinned at 100 and a week read 100/99/100/93/99.

Weights were resized and then **validated against 549,270 hours of real
historical Wisconsin weather** (`npx tsx scripts/calibrate.mts`), replaying a
full year across 20 lakes and every species present in them:

| Measure | Result |
|---|---|
| Hourly scores | p25 46 · p50 56 · p75 67 · p95 80 |
| Clamped at 100 | 0.00% of hours, 0.72% of daily peaks |
| Rating mix | Prime 3.2% · Good 26% · Fair 47% · Slow 20% · Poor 4% |
| Daily peak | p25 69 · p50 77 · p95 94 |
| Spread within a 5-day week | median 17 points |
| **After a sharp pressure rise** | **day peak falls 14.0 on average, 88% of the time** |

> These figures were re-measured on 2026-09-09 after a code review found the
> harness was computing day boundaries in UTC rather than lake-local time. It
> had been scoring 00:00–16:00 local instead of 05:00–21:00, excluding the
> entire evening bite window. The weights themselves held up — the corrected
> sample shows a *stronger* frontal signal — but every number in this table
> moved, which is a reminder that a validation harness needs the same scrutiny
> as the thing it validates.

That last row is the real validation: the post-frontal shutdown every angler
knows about falls out of the weights rather than being hardcoded. Prime at 1.8%
of hours is appropriately rare, and an 18-point spread across a typical week
means the outlook can actually distinguish one day from another.

Re-run the script after any weight change.

### 3. Favourites / recent lakes  ·  DONE 2026-09-09
`localStorage`, no backend. Read through `useSyncExternalStore` so it does not
mismatch the server render, with storage-event sync across tabs.

### OG preview images  ·  DONE 2026-09-09
Cards for the site and for each lake, so a shared link shows the water's name,
size, depth and species instead of a bare URL.

---

## Lake data, round two  ·  DONE 2026-09-09

Prompted by looking at what Lake-Link offers. Their forecaster factors in water
clarity, which this app had no data for; chasing that turned up two better
DNR datasets.

- **Bottom composition and hydrologic lake type.** Rock and gravel hold
  crayfish, muck grows weeds, sand is sparse cover. Lake type (seepage, spring,
  drainage) stands in for clarity. Both now feed the bait engine. Coverage:
  4,725 lakes with bottom composition, 4,884 with a lake type.
- **Stocking history.** 8,794 records across 1,057 lakes, 2015-present.
  Joined by name matching at 88.6%; spot-checked exactly against the DNR's own
  tool for Park Lake (54 rows, every species total identical).
- **Lake outlines and depth maps.** Real shorelines as inline SVG, plus links
  to the DNR bathymetric map (2,315 lakes) and interactive viewer.

Still open from that comparison: per-lake fishing reports and discussions,
which are the social layer and deliberately deferred.

## Horizon 2 — the catch log  ·  ~a week

The original social vision, but **built as a private journal first, not a
feed**.

Log a catch: species, length, lure, lake, with conditions captured
automatically from the forecast engine. Just for you. No followers, no feed.

Three reasons that ordering is right:

- **Useful with exactly one user.** A social app with no users is a ghost town;
  a fishing journal is useful the day it ships.
- **Sidesteps the cold-start problem** that kills most hobby social apps.
- **Generates the data that improves everything else** — logged catches sharpen
  the bait suggestions and, eventually, let you *validate the bite model
  against what actually happened*.

That last point is the real prize. "I built a predictive model, then tested it
against 200 logged catches and tuned it" is a far stronger story than "I built
a fishing app."

This is the phase that earns a real database: Supabase for auth, Postgres and
photo storage. The schema is already sketched in the original plan.

---

## Horizon 3 — actual social

Sharing, following, per-lake leaderboards, seasonal tournaments. Only worth
building once the journal works and has real data in it.

**Two traps that shape the design — decide before building, not after:**

**Leaderboards get gamed immediately.** Unverified photo submissions for
"biggest fish" are trivially faked: old photos, someone else's catch, a fish
held toward the camera. Realistic mitigations are a measuring-board photo
requirement, EXIF/timestamp checks, or keeping leaderboards friends-only so
reputation does the work.

**Spot privacy is non-negotiable.** Anglers will not use something that
broadcasts their coordinates. Catches attach to the *lake*; exact GPS is opt-in
and off by default. Getting this wrong once is unrecoverable.

---

## Deliberately not doing

- **A map** — 1–2 days of tiles, library and CSP work, and the "Open in Maps"
  link already covers the real need.
- **Analytics** — nothing to measure yet.
- **A custom domain** — worth it eventually for a résumé, adds nothing now, and
  can be attached at any time without breaking the deployment.

---

## Data maintenance

The DNR data changes roughly once a season. Refreshing it is four scripts and a
push — see [DEPLOY.md](DEPLOY.md). `02_species.py --from-cache` re-parses
without re-scraping, so a parser change costs seconds rather than 85 minutes.
