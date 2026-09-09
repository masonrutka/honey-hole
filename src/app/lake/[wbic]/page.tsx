import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { getLake, getRegulations, lakeSpeciesProfiles } from "@/lib/lakes";
import { SPECIES, type SpeciesKey } from "@/lib/species";
import ConditionsPanel, { ConditionsSkeleton } from "@/components/ConditionsPanel";
import LakeMemory from "@/components/LakeMemory";
import LakeMap, { LakeMapSkeleton } from "@/components/LakeMap";
import StockingHistory from "@/components/StockingHistory";

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

export default async function LakePage({ params, searchParams }: Props) {
  const { wbic: wbicParam } = await params;
  const { species: speciesParam } = await searchParams;

  // Resolve the lake before anything streams, so an unknown WBIC can still
  // answer a real 404 rather than a 200 with empty content.
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

  const regulations = getRegulations(lake.wbic);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <div className="contours contours-tight -mx-4 px-4 pb-2">
      <nav className="text-[11px] uppercase tracking-[0.16em] text-muted">
        <Link href="/" className="hover:text-accent transition-colors">
          Lakes
        </Link>
        <span className="mx-2 text-edge">/</span>
        <span>{lake.county ? `${lake.county} County` : "Wisconsin"}</span>
      </nav>

      <h1 className="display mt-3 text-4xl sm:text-5xl font-semibold">{lake.name}</h1>
      <p className="mt-2 text-sm text-muted">
        {lake.acres.toLocaleString()} acres
        {lake.maxDepthFt ? ` · ${lake.maxDepthFt} ft max depth` : ""}
        {lake.counties.length > 1
          ? ` · ${lake.counties.join(", ")} Counties`
          : lake.county
            ? ` · ${lake.county} County`
            : ""}
        {lake.boatLandings ? ` · ${lake.boatLandings} boat landings` : ""}
      </p>

      <div className="mt-4">
        <LakeMemory
          lake={{
            wbic: lake.wbic,
            name: lake.name,
            county: lake.county,
            acres: lake.acres,
          }}
        />
      </div>

      </div>

      <div className="mt-8">
        <Suspense fallback={<ConditionsSkeleton />}>
          <ConditionsPanel lake={lake} selected={selected} />
        </Suspense>
      </div>

      <Suspense fallback={<LakeMapSkeleton />}>
        <LakeMap lake={lake} />
      </Suspense>

      <section className="mt-10">
        <h2 className="rule-tick pt-3 text-[11px] uppercase tracking-[0.18em] text-muted">
          Species present
        </h2>
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
          <ul className="mt-2 grid gap-2 sm:grid-cols-2 items-stretch">
            {present.map((s) => (
              <li key={s.key} className="h-full">
                <Link
                  href={`/species/${s.key}`}
                  className="flex h-full flex-col rounded-lg border border-edge bg-surface px-4 py-3
                             hover:border-accent/60 hover:bg-surface-2 transition-colors"
                >
                  <div className="flex items-baseline gap-2">
                    <span className="display text-lg">{s.profile.name}</span>
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

      <StockingHistory wbic={lake.wbic} lakeName={lake.name} />

      {regulations.length > 0 && (
        <section className="mt-10">
          <h2 className="rule-tick pt-3 text-[11px] uppercase tracking-[0.18em] text-muted">
            Regulations
          </h2>
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
      </section>
    </div>
  );
}
