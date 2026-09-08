import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { lakesWithSpecies, speciesCounts } from "@/lib/lakes";
import { SPECIES, type SpeciesKey } from "@/lib/species";
import SpeciesLakeList from "@/components/SpeciesLakeList";

type Props = { params: Promise<{ key: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { key } = await params;
  const profile = SPECIES[key as SpeciesKey];
  if (!profile) return { title: "Unknown species" };
  return {
    title: `${profile.name} lakes`,
    description: `Wisconsin lakes that hold ${profile.name.toLowerCase()}, with DNR abundance ratings.`,
  };
}

export function generateStaticParams() {
  return Object.keys(SPECIES).map((key) => ({ key }));
}

// Cap what the page ships to the browser. Common species cover thousands of
// lakes; the search box reaches the rest through the API.
const INITIAL_LAKES = 250;

export default async function SpeciesPage({ params }: Props) {
  const { key } = await params;
  if (!(key in SPECIES)) notFound();
  const profile = SPECIES[key as SpeciesKey];
  const speciesKey = key as SpeciesKey;
  const lakes = lakesWithSpecies(speciesKey, { limit: INITIAL_LAKES });
  const totalCount = speciesCounts()[speciesKey] ?? 0;

  const slim = lakes.map((l) => ({
    wbic: l.wbic,
    name: l.name,
    county: l.county,
    acres: l.acres,
    abundance: l.species.find((s) => s.key === speciesKey)?.abundance ?? null,
  }));

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <nav className="text-xs text-muted">
        <Link href="/species" className="hover:text-foreground">
          Species
        </Link>
      </nav>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">{profile.name}</h1>
      <p className="mt-2 text-muted text-pretty">{profile.blurb}</p>

      <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 text-sm">
        <div className="rounded-lg border border-edge bg-surface px-3 py-2">
          <dt className="text-[11px] uppercase tracking-wide text-muted">
            Feeds best at
          </dt>
          <dd className="mt-0.5 font-medium">
            {profile.optimalTempF[0]}–{profile.optimalTempF[1]}°F
          </dd>
        </div>
        <div className="rounded-lg border border-edge bg-surface px-3 py-2">
          <dt className="text-[11px] uppercase tracking-wide text-muted">Spawns at</dt>
          <dd className="mt-0.5 font-medium">
            {profile.spawnTempF[0]}–{profile.spawnTempF[1]}°F
          </dd>
        </div>
        <div className="rounded-lg border border-edge bg-surface px-3 py-2">
          <dt className="text-[11px] uppercase tracking-wide text-muted">Light</dt>
          <dd className="mt-0.5 font-medium capitalize">{profile.light}</dd>
        </div>
      </dl>

      <h2 className="mt-8 text-sm font-semibold">
        {totalCount > 0
          ? `${totalCount.toLocaleString()} lakes hold ${profile.name.toLowerCase()}`
          : "No lakes recorded yet"}
      </h2>

      {totalCount === 0 ? (
        <p className="mt-2 text-sm text-muted">
          The DNR species import has not covered this species yet.
        </p>
      ) : (
        <div className="mt-3">
          <SpeciesLakeList
            speciesKey={speciesKey}
            speciesName={profile.name}
            lakes={slim}
            totalCount={totalCount}
          />
        </div>
      )}

    </div>
  );
}
