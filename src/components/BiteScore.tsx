import type { BiteForecast } from "@/lib/forecast";

const RATING_COLOR: Record<string, string> = {
  Prime: "var(--prime)",
  Good: "var(--good)",
  Fair: "var(--fair)",
  Slow: "var(--slow)",
  Poor: "var(--poor)",
};

/**
 * The score is deliberately never shown alone -- the factor list beside it is
 * the point. A number with no reasoning is not something an angler can argue
 * with, and being able to argue with it is what makes it useful.
 */
export default function BiteScore({
  forecast,
  speciesName,
}: {
  forecast: BiteForecast;
  speciesName: string;
}) {
  const color = RATING_COLOR[forecast.rating] ?? "var(--fair)";
  const circumference = 2 * Math.PI * 42;
  const filled = (forecast.score / 100) * circumference;

  return (
    <div className="flex flex-col sm:flex-row gap-6 sm:items-center">
      <div className="relative h-32 w-32 shrink-0">
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
          <circle
            cx="50" cy="50" r="42" fill="none"
            stroke="var(--border)" strokeWidth="8"
          />
          <circle
            cx="50" cy="50" r="42" fill="none"
            stroke={color} strokeWidth="8" strokeLinecap="round"
            strokeDasharray={`${filled} ${circumference}`}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-semibold tabular-nums">{forecast.score}</span>
          <span className="text-xs font-medium" style={{ color }}>
            {forecast.rating}
          </span>
        </div>
      </div>

      <div className="min-w-0">
        <p className="text-sm text-muted">Bite forecast · {speciesName}</p>
        <p className="mt-1 text-base text-pretty first-letter:uppercase">
          {forecast.summary}
        </p>
      </div>
    </div>
  );
}
