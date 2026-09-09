import { stockingBySpecies, stockingNote, getStocking } from "@/lib/stocking";

/**
 * What the DNR has put into this lake, and what that implies.
 *
 * Presented as record-of-fact plus a hedged reading. Stocking does not prove
 * an absence of natural reproduction, and an empty record means "none matched"
 * rather than "never stocked", so neither is stated more strongly than it can
 * be supported.
 */
export default function StockingHistory({
  wbic,
  lakeName,
}: {
  wbic: number;
  lakeName: string;
}) {
  const groups = stockingBySpecies(wbic);
  if (groups.length === 0) return null;

  const events = getStocking(wbic);
  const years = [...new Set(events.map((e) => e.year))].sort((a, b) => a - b);
  const span = years.length ? `${years[0]}–${years[years.length - 1]}` : "";

  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold">Stocking history</h2>
      <p className="mt-1 text-xs text-muted">
        DNR hatchery records for {lakeName}, {span}. Tribal and private stocking
        is not included.
      </p>

      <ul className="mt-2 space-y-2">
        {groups.map((g) => (
          <li
            key={g.species}
            className="rounded-lg border border-edge bg-surface p-4"
          >
            <div className="flex items-baseline gap-3">
              <h3 className="font-medium">{g.species}</h3>
              <span className="ml-auto text-xs text-muted whitespace-nowrap">
                {g.totalFish.toLocaleString()} fish
              </span>
            </div>

            <p className="mt-1.5 text-sm text-accent/90 text-pretty">
              {stockingNote(g)}
            </p>

            <p className="mt-2 text-xs text-muted">
              {g.typicalAge ? `Usually ${g.typicalAge.toLowerCase()} · ` : ""}
              Years: {g.years.slice(0, 12).join(", ")}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
