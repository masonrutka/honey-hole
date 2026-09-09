import type { DayOutlook } from "@/lib/timeline";
import { ratingFor } from "@/lib/forecast";

const RATING_COLOR: Record<string, string> = {
  Prime: "var(--prime)",
  Good: "var(--good)",
  Fair: "var(--fair)",
  Slow: "var(--slow)",
  Poor: "var(--poor)",
};

/**
 * Colour an hour bar by its own score. Derived from ratingFor rather than
 * repeating the thresholds, which is how these drifted out of step with the
 * recalibrated scale in the first place.
 */
function barColor(score: number): string {
  return RATING_COLOR[ratingFor(score)];
}

/**
 * A week of bite outlook, one row per day.
 *
 * The point of this view is planning: the single-point forecast tells you about
 * right now, which is only useful if you are already walking out the door.
 */
export default function OutlookStrip({
  days,
  timezone,
  speciesName,
}: {
  days: DayOutlook[];
  timezone: string;
  speciesName: string;
}) {
  if (days.length === 0) return null;

  const fmtTime = (d: Date) =>
    d
      .toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        timeZone: timezone,
      })
      .replace(":00", "")
      .replace(" AM", "am")
      .replace(" PM", "pm");

  const fmtDay = (d: Date, i: number) =>
    i === 0
      ? "Today"
      : i === 1
        ? "Tomorrow"
        : d.toLocaleDateString("en-US", { weekday: "long", timeZone: timezone });

  const bestDay = days.reduce((a, b) => (b.peakScore > a.peakScore ? b : a));
  const bestIndex = days.indexOf(bestDay);

  return (
    <section className="mt-6">
      <h2 className="rule-tick pt-3 text-[11px] uppercase tracking-[0.18em] text-muted">
        When to go for {speciesName.toLowerCase()}
      </h2>
      <p className="mt-1 text-xs text-muted">
        Peak score for each day, and the longest good stretch. Bars run
        4am to 10pm.
      </p>

      <ul className="mt-3 space-y-1.5">
        {days.map((day, i) => (
          <li
            key={day.date.toISOString()}
            className={`rounded-lg border px-3 py-2.5 ${
              i === bestIndex && days.length > 1
                ? "border-accent/50 bg-accent/5"
                : "border-edge bg-surface"
            }`}
          >
            <div className="flex items-baseline gap-3">
              <span className="w-20 shrink-0 text-sm font-medium">
                {fmtDay(day.date, i)}
              </span>

              {/* Hour-by-hour bars: the shape of the day at a glance. */}
              <span
                className="flex flex-1 items-end gap-px h-7"
                aria-hidden="true"
              >
                {day.hours.map((h, hi) => (
                  <span
                    key={h.time.toISOString()}
                    className="bar-rise flex-1 rounded-sm"
                    style={{
                      height: `${Math.max(8, h.score)}%`,
                      background: barColor(h.score),
                      opacity: ratingFor(h.score) === "Fair" ? 0.4
                        : h.score >= 64 ? 0.95 : 0.4,
                      ["--bar-i" as string]: hi,
                    }}
                  />
                ))}
              </span>

              <span
                className="w-8 shrink-0 text-right text-sm font-semibold tabular-nums"
                style={{ color: RATING_COLOR[day.rating] }}
              >
                {day.peakScore}
              </span>
            </div>

            <p className="mt-1 text-xs text-muted pl-[5.75rem]">
              {day.goodAllDay ? (
                <>
                  <span className="text-foreground">Good most of the day</span>
                  {i === bestIndex && days.length > 1 && (
                    <span className="text-accent"> · best day this week</span>
                  )}
                </>
              ) : day.best ? (
                <>
                  Best window{" "}
                  <span className="text-foreground">
                    {fmtTime(day.best.start)}–{fmtTime(day.best.end)}
                  </span>
                  {i === bestIndex && days.length > 1 && (
                    <span className="text-accent"> · best day this week</span>
                  )}
                </>
              ) : (
                "No strong window — conditions stay flat all day"
              )}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
