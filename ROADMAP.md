# Roadmap

Written 2026-09-08, just after the first deploy to
[honey-hole-one.vercel.app](https://honey-hole-one.vercel.app).

Ordered by what actually makes the app better, not by what is fun to build.

---

## Horizon 1 — finish the lake app

Three things, then the lake side is done and worth leaving alone.

### 1. Forecast timeline  ·  ~half a day
**The biggest remaining gap.** The app answers "how is it right now" but not
"when should I go" — and the second question is the one anglers actually ask.
You check a fishing app on Wednesday to plan Saturday.

Cheap to build: the hourly weather is already fetched (bump `forecast_days`)
and `biteForecast()` is a pure function of a timestamp, so scoring the next
week is a loop over code that already exists. No new dependencies.

Delivers two things: **best windows today** and **best day this week**.

### 2. Recalibrate the bite score  ·  ~2 hours
On a genuinely good evening the raw total overshoots 100 and gets clamped, so
several lakes tie at exactly 100 and the ranking loses resolution right where
it matters most. Needs weight tuning plus tests asserting that a near-perfect
night lands around 85 rather than pegging the scale.

Do this *after* the timeline, when scores across a full week are visible
instead of a single evening.

### 3. Favourites / recent lakes  ·  ~1 hour
`localStorage`, no backend. In practice you check the same handful of lakes
over and over.

### Also worth 30 minutes: an OG preview image
So the link renders as a proper card when pasted into a résumé, LinkedIn or a
text message. Next has built-in support for this.

---

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
