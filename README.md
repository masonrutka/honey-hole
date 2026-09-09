# Honey Hole — Wisconsin lake and fishing intelligence

Species, regulations, live conditions and bait suggestions for **5,028 Wisconsin
lakes**, built entirely on open Wisconsin DNR data.

Wisconsin publishes an unusual amount of high-quality fisheries data, but it is
scattered across three separate systems and none of it is designed to be read on
a phone at 5am. Honey Hole joins it together, keyed by the DNR's own waterbody id
(WBIC), and adds a transparent bite forecast on top.

## What it does

- **Search 5,028 lakes** by name or county, or find the closest water to you.
- **See what lives there** — species with the DNR's own abundance ratings
  (Abundant / Common / Present), from fisheries survey data.
- **See what you can keep** — per-species seasons, size limits and bag limits for
  that specific lake.
- **Decide whether to go** — a 0-100 bite forecast per species, with every
  contributing factor shown and scored.
- **Know what to throw** — presentation suggestions matched to season, water
  temperature, sky and wind, each with the reasoning behind it.

## Architecture

```
ingest/            Python ETL (run locally, output committed)
  wdnr.py            Shared ArcGIS REST client: pagination, retry, TLS
  names.py           Shared name handling, used by 04 and 06
  01_lakes.py        24K Hydrography layer  -> 5,028 lakes with WGS84 centroids
  02_species.py      DNR lake pages         -> species, county, depth, landings
  03_regulations.py  Lake regulations layer -> 122k tidy regulation rows
  05_lake_facts.py   DNR facts pages        -> bottom composition, lake type
  06_stocking.py     DNR stocking system    -> 8,794 records, joined by name
  04_build_dataset.py  merge + intern strings -> src/data/*.json (run last)

src/lib/           Pure, dependency-free rules engines (unit tested)
  forecast.ts        Bite scoring from weather, light, solunar and turnover
  timeline.ts        Multi-day outlook built on forecast.ts
  bait.ts            Suggestions matched to conditions and lake bottom
  species.ts         Behavioural profiles for Wisconsin gamefish
  weather.ts         Open-Meteo client + water temperature estimation
  lakes.ts           Data access: search, proximity, regulation lookup
  stocking.ts        DNR stocking history and what it implies
  geometry.ts        Lake outlines as SVG paths
  storage.ts         Saved and recent lakes (localStorage)

scripts/
  calibrate.mts      Replays a year of real weather through the bite engine

src/app/           Next.js App Router (React Server Components)
```

### Why static JSON instead of a database

The DNR dataset is read-only reference data that changes about once a season.
A database would add cost, latency and deployment surface without buying
anything. When catch logging arrives it needs real writes, auth and per-user
rows — that is the point to introduce Postgres, not before.

The regulations pull is 22 MB of mostly-duplicate text: 122,807 rows drawn from
only **315 distinct regulation strings**. Interning those strings and referencing
them by index takes the shipped payload to under 1 MB.

### Why the forecast shows its work

The bite score is never displayed alone. Every factor that fed it is listed with
its point contribution:

```
WIND         Light SSE chop (9 mph) — close to ideal              +10
SKY          Overcast (100%) — extends the low-light bite all day  +9
TIME OF DAY  Midday — the slowest stretch                          -7
PRESSURE     Rising (+1.7 mb in 6h) — fish easing back off         -6
```

A number with no reasoning is not something an angler can argue with, and being
able to argue with it is what makes it useful.

## Data sources

| Source | Provides |
|---|---|
| [WDNR 24K Hydrography](https://dnrmaps.wi.gov/arcgis/rest/services/DW_Map_Dynamic/EN_SurfaceWater_WTM_Ext_Dynamic_L16/MapServer/5) | Lake polygons, WBIC, names |
| [WDNR lake pages](https://apps.dnr.wi.gov/lakes/lakepages/LakeDetail.aspx?wbic=762400) | Species + abundance, county, max depth, boat landings |
| [WDNR lake regulations](https://dnrmaps.wi.gov/arcgis2/rest/services/FM_WFF/FM_WFF_LAKE_REGULATIONS_WTM_EXT/MapServer/2) | Per-species seasons, size and bag limits |
| [Open-Meteo](https://open-meteo.com/) | Hourly temp, pressure, wind, cloud, precipitation |
| [SunCalc](https://github.com/mourner/suncalc) | Sun and moon geometry for solunar periods |

All free, no API keys. WBIC is the join key across every DNR dataset.

## Running it

```bash
npm install
npm run dev          # http://localhost:3000
npm test             # rules engine unit tests
```

Refreshing the dataset from the DNR (only needed once a season):

```bash
python3 ingest/01_lakes.py               # ~1 min   hydrography -> 5,028 lakes
python3 ingest/02_species.py --limit 0   # ~85 min  species, county, depth
python3 ingest/03_regulations.py         # ~1 min   per-species regulations
python3 ingest/05_lake_facts.py          # ~2 hr    bottom composition, lake type
python3 ingest/06_stocking.py            # ~1 min   stocking history
python3 ingest/04_build_dataset.py       # instant  merge -> src/data/
```

Run in that order: `04` merges everything, so it goes last. Steps `02` and `05`
are the slow ones and are deliberately polite -- one request per second, every
page cached to disk, and safe to interrupt and resume. Both take
`--from-cache` to re-parse without re-fetching, which turns a parser change
from an 85-minute job into a few seconds.

`06` reports the match rate for its name-based join; if that drops sharply the
DNR has changed something and the output should not be trusted.

## Known limitations

- **Water temperature is estimated**, not measured. USGS gauges cover rivers,
  not inland lakes, so there is no free live feed. Honey Hole models surface temp
  from recent air temperatures damped by lake size and depth, and labels it as
  an estimate everywhere it appears.
- **The bite score is a heuristic**, not a validated model. It encodes
  well-established angling relationships but has never been fitted against a
  catch database.
- **Regulations can lag** rule changes. The DNR pamphlet is always the authority.

## Roadmap

Catch logging with photos, a friends feed, and per-lake leaderboards — which is
when this grows a real database, authentication, and a spot-privacy model.
Anglers will not use an app that broadcasts their exact coordinates, so catches
will attach to the lake with exact GPS opt-in only.
