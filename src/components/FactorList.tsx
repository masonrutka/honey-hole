import type { Factor } from "@/lib/forecast";

function toneFor(delta: number): string {
  if (delta >= 8) return "text-prime";
  if (delta > 0) return "text-good";
  if (delta === 0) return "text-muted";
  if (delta > -8) return "text-slow";
  return "text-poor";
}

/** Every factor that fed the score, with its contribution made explicit. */
export default function FactorList({ factors }: { factors: Factor[] }) {
  const ranked = [...factors].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  return (
    <ul className="divide-y divide-edge/60">
      {ranked.map((f) => (
        <li key={f.label} className="flex items-start gap-3 py-2.5">
          <span className="w-24 shrink-0 text-xs uppercase tracking-wide text-muted pt-0.5">
            {f.label}
          </span>
          <span className="flex-1 text-sm text-pretty">{f.detail}</span>
          <span
            className={`shrink-0 text-xs font-medium tabular-nums ${toneFor(f.delta)}`}
            title={`${f.delta > 0 ? "+" : ""}${f.delta} points`}
          >
            {f.delta > 0 ? "+" : ""}
            {f.delta}
          </span>
        </li>
      ))}
    </ul>
  );
}
