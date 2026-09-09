import Link from "next/link";
import type { Metadata } from "next";
import { speciesCounts } from "@/lib/lakes";
import { ALL_SPECIES } from "@/lib/species";

export const metadata: Metadata = {
  title: "Species",
  description: "Browse Wisconsin gamefish and find the lakes that hold them.",
};

export default function SpeciesIndex() {
  const counts = speciesCounts();
  const listed = ALL_SPECIES.filter((s) => (counts[s.key] ?? 0) > 0).sort(
    (a, b) => (counts[b.key] ?? 0) - (counts[a.key] ?? 0),
  );

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <h1 className="text-3xl font-semibold tracking-tight">Species</h1>
      <p className="mt-2 text-muted">
        Wisconsin gamefish, and the lakes the DNR has recorded them in.
      </p>

      {listed.length === 0 ? (
        <p className="mt-6 text-sm text-muted">
          Species data is still being imported.
        </p>
      ) : (
        <ul className="mt-6 grid gap-2 sm:grid-cols-2 items-stretch">
          {listed.map((s) => (
            <li key={s.key} className="h-full">
              {/* h-full on the anchor: the <li> stretches to the row, but a
                  block anchor is content-height, so a short blurb left a short
                  card sitting in a tall row. */}
              <Link
                href={`/species/${s.key}`}
                className="flex h-full flex-col rounded-lg border border-edge bg-surface p-4
                           hover:border-accent/60 hover:bg-surface-2 transition-colors"
              >
                <div className="flex items-baseline gap-2">
                  <span className="display text-lg">{s.name}</span>
                  <span className="ml-auto text-xs text-muted">
                    {(counts[s.key] ?? 0).toLocaleString()} lakes
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted text-pretty">{s.blurb}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
