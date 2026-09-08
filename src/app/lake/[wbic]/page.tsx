import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { getLake, getRegulations, lakeSpeciesProfiles } from "@/lib/lakes";
import { fetchWeather, estimateWaterTempF, celestialFor } from "@/lib/weather";
import { biteForecast, compass, moonPhaseName } from "@/lib/forecast";
import { suggestBaits, seasonFor, skyFor, windBandFor } from "@/lib/bait";
import { SPECIES, type SpeciesKey } from "@/lib/species";
import BiteScore from "@/components/BiteScore";
import FactorList from "@/components/FactorList";

// Weather drives this page, so refresh hourly rather than on every request.
export const revalidate = 3600;

type Props = {
  params: Promise<{ wbic: string }>;
  searchParams: Promise<{ species?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { wbic } = await params;
  const lake = getLake(Number(wbic));
  if (!lake) return { title: "Lake not found" };
  return {
    title: lake.name,
    description: `${lake.name} — ${lake.acres.toLocaleString()} acres in ${
      lake.county ?? "Wisconsin"
    }. Species, regulations, conditions and bait suggestions.`,
  };
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-edge bg-surface px-3 py-2">
      <dt className="text-[11px] uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 font-medium tabular-nums">{value}</dd>
    </div>
  );
}

export default async function LakePage({ params, searchParams }: Props) {
  const { wbic: wbicParam } = await params;
  const { species: speciesParam } = await searchParams;

  const wbic = Number(wbicParam);
  if (!Number.isFinite(wbic)) notFound();
  const lake = getLake(wbic);
  if (!lake) notFound();

  const present = lakeSpeciesProfiles(lake);
  // Default to the first species the DNR lists; fall back to walleye when the
  // lake page has not been scraped yet.
  const fallback: SpeciesKey = present[0]?.key ?? "walleye";
  const selected: SpeciesKey =
    speciesParam && speciesParam in SPECIES ? (speciesParam as SpeciesKey) : fallback;
  const profile = SPECIES[selected];

  let weatherError: string | null = null;
  let panel: React.ReactNode = null;

  try {
    const weather = await fetchWeather(lake.lat, lake.lon);
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
    });

    const current =
      weather.hours.find((h) => new Date(h.time) >= now) ?? weather.hours.at(-1)!;

    const baits = suggestBaits({
      species: selected,
      waterTempF,
      month: now.getMonth() + 1,
      sky: skyFor(current.cloudPct),
      wind: windBandFor(current.windMph),
    });

    const season = seasonFor(now.getMonth() + 1, waterTempF);

    panel = (
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

        <section className="mt-6">
          <h2 className="text-sm font-semibold">
            Right now on {lake.name}
          </h2>
          <dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4 text-sm">
            <Stat label="Air" value={`${Math.round(current.tempF)}°F`} />
            <Stat
              label="Water (est.)"
              value={`${Math.round(waterTempF)}°F`}
            />
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
              value={`${weather.sunrise[weather.todayIndex].toLocaleTimeString("en-US", {
                hour: "numeric", minute: "2-digit", timeZone: weather.timezone,
              })} / ${weather.sunset[weather.todayIndex].toLocaleTimeString("en-US", {
                hour: "numeric", minute: "2-digit", timeZone: weather.timezone,
              })}`}
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
  } catch {
    weatherError =
      "Live conditions are unavailable right now. Lake details and regulations below are unaffected.";
  }

  const regulations = getRegulations(lake.wbic);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <nav className="text-xs text-muted">
        <Link href="/" className="hover:text-foreground">
          Lakes
        </Link>
        <span className="mx-1.5">/</span>
        <span>{lake.county ? `${lake.county} County` : "Wisconsin"}</span>
      </nav>

      <h1 className="mt-2 text-3xl font-semibold tracking-tight">{lake.name}</h1>
      <p className="mt-1 text-sm text-muted">
        {lake.acres.toLocaleString()} acres
        {lake.maxDepthFt ? ` · ${lake.maxDepthFt} ft max depth` : ""}
        {lake.counties.length > 1
          ? ` · ${lake.counties.join(", ")} Counties`
          : lake.county
            ? ` · ${lake.county} County`
            : ""}
        {lake.boatLandings ? ` · ${lake.boatLandings} boat landings` : ""}
      </p>

      {weatherError && (
        <p className="mt-6 rounded-lg border border-slow/40 bg-slow/10 px-4 py-3 text-sm">
          {weatherError}
        </p>
      )}

      <div className="mt-6">{panel}</div>

      <section className="mt-8">
        <h2 className="text-sm font-semibold">Species present</h2>
        {present.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            The DNR does not publish a species list for this water.{" "}
            <a
              href={lake.dnrUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="text-accent hover:underline"
            >
              Check the DNR lake page
            </a>
            .
          </p>
        ) : (
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {present.map((s) => (
              <li key={s.key}>
                <Link
                  href={`/species/${s.key}`}
                  className="block rounded-lg border border-edge bg-surface px-4 py-3
                             hover:border-accent/60 hover:bg-surface-2 transition-colors"
                >
                  <div className="flex items-baseline gap-2">
                    <span className="font-medium">{s.profile.name}</span>
                    {s.abundance && (
                      <span className="text-[11px] uppercase tracking-wide text-accent">
                        {s.abundance}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted text-pretty">{s.profile.blurb}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {regulations.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold">Regulations</h2>
          <p className="mt-1 text-xs text-muted">
            From the WDNR lake regulations layer. Always confirm against the
            current pamphlet before keeping fish.
          </p>
          <ul className="mt-2 divide-y divide-edge/60 rounded-lg border border-edge overflow-hidden">
            {regulations.map((r) => (
              <li key={r.speciesGroup} className="bg-surface px-4 py-3">
                <p className="text-sm font-medium">{r.speciesGroup}</p>
                <p className="mt-0.5 text-sm text-muted text-pretty">{r.text}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8 flex flex-wrap gap-3 text-sm">
        <a
          href={lake.dnrUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="rounded-lg border border-edge bg-surface px-4 py-2 hover:border-accent hover:text-accent transition-colors"
        >
          DNR lake page ↗
        </a>
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${lake.lat},${lake.lon}`}
          target="_blank"
          rel="noreferrer noopener"
          className="rounded-lg border border-edge bg-surface px-4 py-2 hover:border-accent hover:text-accent transition-colors"
        >
          Open in Maps ↗
        </a>
      </section>
    </div>
  );
}
