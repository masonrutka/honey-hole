import Link from "next/link";
import LakeSearch from "@/components/LakeSearch";
import { featuredLakes, totalLakes } from "@/lib/lakes";

export default function Home() {
  const featured = featuredLakes(8);
  const count = totalLakes();

  return (
    <div className="mx-auto w-full max-w-5xl px-4">
      <section className="pt-14 pb-10 sm:pt-20">
        <h1 className="text-3xl sm:text-5xl font-semibold tracking-tight text-balance">
          Know the water before you go.
        </h1>
        <p className="mt-4 max-w-2xl text-muted text-base sm:text-lg text-pretty">
          Species, regulations, conditions and what to throw — for{" "}
          {count.toLocaleString()} Wisconsin lakes, built on open Wisconsin DNR data.
        </p>

        <div className="mt-8 max-w-2xl">
          <LakeSearch />
        </div>
      </section>

      <section className="pb-4">
        <h2 className="text-xs uppercase tracking-wide text-muted">Popular water</h2>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {featured.map((lake) => (
            <li key={lake.wbic}>
              <Link
                href={`/lake/${lake.wbic}`}
                className="block rounded-lg border border-edge bg-surface px-4 py-3
                           hover:border-accent/60 hover:bg-surface-2 transition-colors"
              >
                <div className="flex items-baseline gap-2">
                  <span className="font-medium">{lake.name}</span>
                  <span className="ml-auto text-xs text-muted">
                    {lake.acres.toLocaleString()} ac
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted">
                  {lake.county ? `${lake.county} County` : "Wisconsin"}
                  {lake.species.length > 0 && ` · ${lake.species.length} species`}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-12 grid gap-4 sm:grid-cols-3">
        {[
          {
            title: "What lives there",
            body: "Species and their abundance, straight from WDNR fisheries survey data — not guesswork.",
          },
          {
            title: "What you can keep",
            body: "Per-species seasons, size limits and bag limits for this specific lake.",
          },
          {
            title: "Whether to go",
            body: "A bite forecast from barometric trend, wind, light and water temperature — and it shows its work.",
          },
        ].map((card) => (
          <div key={card.title} className="rounded-lg border border-edge bg-surface p-4">
            <h3 className="font-medium">{card.title}</h3>
            <p className="mt-1.5 text-sm text-muted text-pretty">{card.body}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
