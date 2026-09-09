import Link from "next/link";

import { fetchWeather, estimateWaterTempF, celestialFor } from "@/lib/weather";
import { biteForecast, compass, moonPhaseName } from "@/lib/forecast";
import { suggestBaits, seasonFor, skyFor, windBandFor, readWater } from "@/lib/bait";
import { SPECIES, type SpeciesKey } from "@/lib/species";
import type { Lake } from "@/lib/lakes";
import { lakeSpeciesProfiles } from "@/lib/lakes";
import { buildOutlook } from "@/lib/timeline";
import BiteScore from "./BiteScore";
import FactorList from "./FactorList";
import OutlookStrip from "./OutlookStrip";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-edge bg-surface px-3 py-2">
      <dt className="text-[11px] uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 font-medium tabular-nums">{value}</dd>
    </div>
  );
}

/**
 * Everything on the lake page that depends on a live weather fetch.
 *
 * This is deliberately a separate async component so the page can render the
 * lake identity, species and regulations immediately and stream this in behind
 * a Suspense boundary. Keeping the boundary here rather than at the route level
 * also preserves real 404s: Next cannot change the status once a response has
 * started streaming, so a route-level loading.tsx would make every unknown
 * lake answer 200.
 */
export default async function ConditionsPanel({
  lake,
  selected,
}: {
  lake: Lake;
  selected: SpeciesKey;
}) {
  const profile = SPECIES[selected];
  const present = lakeSpeciesProfiles(lake);

  let weather;
  try {
    weather = await fetchWeather(lake.lat, lake.lon);
  } catch {
    return (
      <p className="rounded-lg border border-slow/40 bg-slow/10 px-4 py-3 text-sm">
        Live conditions are unavailable right now. Species and regulations below
        are unaffected.
      </p>
    );
  }

  const now = new Date();
  const waterTempF = estimateWaterTempF(
    weather.dailyMeanAirF,
    { acres: lake.acres, maxDepthFt: lake.maxDepthFt },
    weather.todayIndex,
  );
  const celestial = celestialFor(
    now,
    lake.lat,
    lake.lon,
    weather.sunrise[weather.todayIndex],
    weather.sunset[weather.todayIndex],
  );
  const forecast = biteForecast({
    hours: weather.hours,
    at: now,
    celestial,
    species: selected,
    waterTempF,
    lake: { maxDepthFt: lake.maxDepthFt, acres: lake.acres },
  });

  const current =
    weather.hours.find((h) => new Date(h.time) >= now) ?? weather.hours.at(-1)!;

  const baits = suggestBaits({
    species: selected,
    waterTempF,
    month: now.getMonth() + 1,
    sky: skyFor(current.cloudPct),
    wind: windBandFor(current.windMph),
    bottom: lake.bottom,
    lakeType: lake.lakeType,
  });

  // What the lake bed and hydrology mean for where fish sit and what colour to throw.
  const water = readWater(lake.bottom, lake.lakeType);

  const season = seasonFor(now.getMonth() + 1, waterTempF);

  // "When should I go" -- the planning view. Reuses the hourly data already
  // fetched above, so this costs no extra requests.
  const outlook = buildOutlook(
    weather,
    { acres: lake.acres, maxDepthFt: lake.maxDepthFt },
    selected,
    lake.lat,
    lake.lon,
    5,
  );
  const clock = (d: Date) =>
    d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: weather.timezone,
    });

  return (
    <>
      <section className="rounded-xl border border-edge bg-surface/60 p-5">
        <BiteScore forecast={forecast} speciesName={profile.name} />

        {present.length > 1 && (
          <div className="mt-5 flex flex-wrap gap-1.5">
            {present.map((s) => (
              <Link
                key={s.key}
                href={`/lake/${lake.wbic}?species=${s.key}`}
                scroll={false}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  s.key === selected
                    ? "border-accent bg-accent/15 text-accent"
                    : "border-edge text-muted hover:border-accent/60 hover:text-foreground"
                }`}
              >
                {s.profile.name}
              </Link>
            ))}
          </div>
        )}

        <div className="mt-5 border-t border-edge/60 pt-3">
          <FactorList factors={forecast.factors} />
        </div>

        <p className="mt-3 text-xs text-muted text-pretty">{profile.blurb}</p>
      </section>

      <OutlookStrip
        days={outlook}
        timezone={weather.timezone}
        speciesName={profile.name}
      />

      <section className="mt-6">
        <h2 className="text-sm font-semibold">Right now on {lake.name}</h2>
        <dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4 text-sm">
          <Stat label="Air" value={`${Math.round(current.tempF)}°F`} />
          <Stat label="Water (est.)" value={`${Math.round(waterTempF)}°F`} />
          <Stat
            label="Wind"
            value={`${Math.round(current.windMph)} mph ${compass(current.windDirDeg)}`}
          />
          <Stat label="Pressure" value={`${Math.round(current.pressureHpa)} mb`} />
          <Stat label="Sky" value={`${Math.round(current.cloudPct)}% cloud`} />
          <Stat label="Season" value={season.replace("_", " ")} />
          <Stat label="Moon" value={moonPhaseName(celestial.moonPhase)} />
          <Stat
            label="Sunrise / set"
            value={`${clock(weather.sunrise[weather.todayIndex])} / ${clock(
              weather.sunset[weather.todayIndex],
            )}`}
          />
        </dl>
        <p className="mt-2 text-xs text-muted">
          Water temperature is estimated from recent air temperature and this
          lake&rsquo;s size and depth — there is no live gauge on most Wisconsin
          lakes. Treat it as a guide, and trust your own thermometer over it.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold">
          What to throw for {profile.name.toLowerCase()}
        </h2>
        {water && (
          <div className="mt-2 rounded-lg border border-edge bg-surface-2/60 p-4">
            <p className="text-[11px] uppercase tracking-wide text-muted">
              Reading the water
            </p>
            {water.bottomNote && (
              <p className="mt-1.5 text-sm text-pretty">{water.bottomNote}</p>
            )}
            <p className="mt-1.5 text-sm text-muted text-pretty">{water.colorNote}</p>
            {lake.bottom && (
              <p className="mt-2 text-xs text-muted">
                Bottom:{" "}
                {(["muck", "sand", "gravel", "rock"] as const)
                  .filter((k) => lake.bottom![k] > 0)
                  .map((k) => `${lake.bottom![k]}% ${k}`)
                  .join(" · ")}
                {lake.lakeType ? ` · ${lake.lakeType.toLowerCase()} lake` : ""}
              </p>
            )}
          </div>
        )}

        <ul className="mt-2 space-y-2">
          {baits.map((b, i) => (
            <li
              key={`${b.presentation}-${i}`}
              className="rounded-lg border border-edge bg-surface p-4"
            >
              <div className="flex items-baseline gap-3">
                <h3 className="font-medium">{b.presentation}</h3>
                <span className="ml-auto text-[11px] uppercase tracking-wide text-muted">
                  {b.confidence >= 0.75
                    ? "Strong match"
                    : b.confidence >= 0.55
                      ? "Worth trying"
                      : "Situational"}
                </span>
              </div>
              <p className="mt-1 text-sm">{b.detail}</p>
              <p className="mt-1 text-sm text-muted">{b.depth}</p>
              <p className="mt-2 text-sm text-accent/90 text-pretty">{b.why}</p>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

/** Placeholder shown while the weather fetch is in flight. */
export function ConditionsSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="rounded-xl border border-edge bg-surface/60 p-5">
        <div className="flex gap-6 items-center">
          <div className="h-32 w-32 rounded-full bg-surface-2 shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-40 rounded bg-surface-2" />
            <div className="h-4 w-full max-w-sm rounded bg-surface-2" />
          </div>
        </div>
        <div className="mt-6 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-3 w-full rounded bg-surface-2" />
          ))}
        </div>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-14 rounded-lg bg-surface-2" />
        ))}
      </div>
    </div>
  );
}
