import Link from "next/link";
import LakeSearch from "@/components/LakeSearch";
import SavedLakes from "@/components/SavedLakes";
import { featuredLakes, totalLakes } from "@/lib/lakes";

export default function Home() {
  const featured = featuredLakes(8);
  const count = totalLakes();

  return (
    <div className="mx-auto w-full max-w-5xl px-4">
      <section className="contours pt-16 pb-12 sm:pt-24 -mx-4 px-4">
        <p className="text-[11px] uppercase tracking-[0.2em] text-accent">
          {count.toLocaleString()} Wisconsin lakes
        </p>
        <h1 className="display mt-3 text-[2.6rem] leading-[1.05] sm:text-6xl font-semibold text-balance max-w-3xl">
          Know the water before you go.
        </h1>
        <p className="mt-5 max-w-xl text-muted text-base sm:text-lg text-pretty">
          Species, regulations, live conditions and what to throw — built
          entirely on open Wisconsin DNR data.
        </p>

        <div className="mt-9 max-w-2xl">
          <LakeSearch />
        </div>
      </section>

      <SavedLakes />

      {/* A list, not a grid of boxes: hairlines carry the structure. */}
      <section className="pb-4">
        <h2 className="rule-tick pt-3 text-[11px] uppercase tracking-[0.18em] text-muted">
          Popular water
        </h2>
        <ul className="mt-1 divide-y divide-edge/60">
          {featured.map((lake) => (
            <li key={lake.wbic}>
              <Link
                href={`/lake/${lake.wbic}`}
                className="group flex items-baseline gap-3 py-3 -mx-2 px-2 rounded
                           hover:bg-surface transition-colors"
              >
                <span className="display text-lg group-hover:text-accent transition-colors">
                  {lake.name}
                </span>
                <span className="text-xs text-muted">
                  {lake.county ? `${lake.county} County` : "Wisconsin"}
                </span>
                <span className="ml-auto text-xs text-muted tabular-nums whitespace-nowrap">
                  {lake.species.length > 0 && (
                    <span className="mr-3">{lake.species.length} species</span>
                  )}
                  {lake.acres.toLocaleString()} ac
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-14 grid gap-8 sm:grid-cols-3 sm:gap-10">
        {[
          {
            n: "01",
            title: "What lives there",
            body: "Species and their abundance, straight from WDNR fisheries survey data — not guesswork.",
          },
          {
            n: "02",
            title: "What you can keep",
            body: "Per-species seasons, size limits and bag limits for this specific lake.",
          },
          {
            n: "03",
            title: "Whether to go",
            body: "A bite forecast from barometric trend, wind, light and water temperature — and it shows its work.",
          },
        ].map((card) => (
          <div key={card.title}>
            <span className="text-[11px] tabular-nums text-accent tracking-[0.2em]">
              {card.n}
            </span>
            <h3 className="display mt-2 text-lg">{card.title}</h3>
            <p className="mt-1.5 text-sm text-muted text-pretty">{card.body}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
