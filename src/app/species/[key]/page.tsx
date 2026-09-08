import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { lakesWithSpecies } from "@/lib/lakes";
import { SPECIES, type SpeciesKey } from "@/lib/species";

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

const ABUNDANCE_TONE: Record<string, string> = {
  Abundant: "text-prime",
  Common: "text-good",
  Present: "text-muted",
};

export default async function SpeciesPage({ params }: Props) {
  const { key } = await params;
  if (!(key in SPECIES)) notFound();
  const profile = SPECIES[key as SpeciesKey];
  const lakes = lakesWithSpecies(key as SpeciesKey, { limit: 60 });

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
        {lakes.length > 0
          ? `Lakes holding ${profile.name.toLowerCase()}`
          : "No lakes recorded yet"}
      </h2>

      {lakes.length === 0 ? (
        <p className="mt-2 text-sm text-muted">
          The DNR species import has not covered this species yet.
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-edge/70 rounded-lg border border-edge overflow-hidden">
          {lakes.map((lake) => {
            const abundance =
              lake.species.find((s) => s.key === key)?.abundance ?? "Present";
            return (
              <li key={lake.wbic}>
                <Link
                  href={`/lake/${lake.wbic}`}
                  className="flex items-baseline gap-3 px-4 py-3 bg-surface hover:bg-surface-2 transition-colors"
                >
                  <span className="font-medium">{lake.name}</span>
                  <span className="text-xs text-muted">
                    {lake.county ? `${lake.county} County` : "Wisconsin"}
                  </span>
                  <span
                    className={`ml-auto text-[11px] uppercase tracking-wide ${
                      ABUNDANCE_TONE[abundance] ?? "text-muted"
                    }`}
                  >
                    {abundance}
                  </span>
                  <span className="text-xs text-muted whitespace-nowrap w-20 text-right">
                    {lake.acres.toLocaleString()} ac
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
