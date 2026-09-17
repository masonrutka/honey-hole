/**
 * Reconciling a reported water temperature with the modelled estimate.
 *
 * The estimate in `weather.ts` is the weakest number in the app: it infers
 * surface temperature from a lagged mean air temperature because no free feed
 * of Wisconsin inland lake temps exists. A reading from somebody who put a
 * thermometer in the water beats it outright -- but only while it is fresh.
 * A week-old reading through a cold front is worse than the model, because the
 * model at least knows the front happened.
 *
 * So a reading does not simply replace the estimate; its influence decays.
 * Pure and dependency-free, like the other rules modules, so the decay can be
 * tested at fixed ages rather than eyeballed.
 */

/** Below this age a reading is taken as-is. */
const FULL_TRUST_HOURS = 24;

/** By this age it carries no weight at all. */
const NO_TRUST_HOURS = 24 * 5;

export type TempSource = "reported" | "blended" | "estimated";

export interface WaterTemp {
  tempF: number;
  source: TempSource;
  /** Age of the reading used, in hours. Null when nothing was reported. */
  ageHours: number | null;
}

export function reconcileWaterTemp(
  estimateF: number,
  report: { surfaceTempF: number | null; observedAt: string | null } | null,
  now: Date = new Date(),
): WaterTemp {
  const estimated: WaterTemp = { tempF: estimateF, source: "estimated", ageHours: null };

  if (!report || report.surfaceTempF === null || !report.observedAt) return estimated;

  const observed = new Date(report.observedAt);
  const ms = observed.getTime();
  if (!Number.isFinite(ms)) return estimated;

  const ageHours = (now.getTime() - ms) / 3_600_000;

  // A reading timestamped in the future is a clock problem, not a reading.
  // Treat a little skew as "just now" and anything wilder as unusable.
  if (ageHours < -1) return estimated;
  const age = Math.max(0, ageHours);

  if (age >= NO_TRUST_HOURS) return estimated;
  if (age <= FULL_TRUST_HOURS) {
    return { tempF: report.surfaceTempF, source: "reported", ageHours: age };
  }

  // Between the two, slide linearly from the reading toward the estimate.
  const t = (age - FULL_TRUST_HOURS) / (NO_TRUST_HOURS - FULL_TRUST_HOURS);
  return {
    tempF: report.surfaceTempF * (1 - t) + estimateF * t,
    source: "blended",
    ageHours: age,
  };
}

/** The label under the number: it must never claim more than it knows. */
export function tempLabel(source: TempSource): string {
  switch (source) {
    case "reported":
      return "Water (reported)";
    case "blended":
      return "Water (report + est.)";
    case "estimated":
      return "Water (est.)";
  }
}
