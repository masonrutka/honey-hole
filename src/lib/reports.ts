import "server-only";

import { supabaseAnon } from "./supabase/server";

export interface LatestConditions {
  /** Measured surface temperature, if anyone has reported one recently. */
  surfaceTempF: number | null;
  observedAt: string | null;
  clarity: string | null;
  waterLevel: string | null;
  /** How many visible reports this lake has had in the last seven days. */
  reportCount: number;
}

const NONE: LatestConditions = {
  surfaceTempF: null,
  observedAt: null,
  clarity: null,
  waterLevel: null,
  reportCount: 0,
};

/**
 * What the water was last reported to be doing, for the conditions panel.
 *
 * Deliberately anonymous and session-free, for two reasons -- only one of
 * which is the one you would guess.
 *
 * The lake page is NOT statically generated: it awaits searchParams for the
 * species selector, which forces per-request rendering, so `revalidate = 3600`
 * on that route does nothing and a cookie read there would cost nothing
 * either. The real reasons are that this datum is the same for every visitor,
 * so attaching a session to it would only add work, and that keeping it
 * session-free means a signed-out visitor sees the same water temperature as
 * everyone else.
 *
 * Returns the empty result rather than throwing on any failure. A database
 * outage should cost the lake page one optional line, not the whole page --
 * the DNR data and the forecast do not depend on this.
 */
export async function latestConditions(wbic: number): Promise<LatestConditions> {
  const supabase = supabaseAnon();
  if (!supabase) return NONE;

  try {
    const { data, error } = await supabase
      .rpc("latest_water_report", { lake_wbic: wbic })
      .maybeSingle();

    if (error || !data) return NONE;

    const row = data as {
      observed_at: string | null;
      surface_temp_f: number | string | null;
      clarity: string | null;
      water_level: string | null;
      report_count: number | string | null;
    };

    return {
      // Postgres numeric arrives as a string through PostgREST -- it does not
      // fit a double without losing precision in the general case, so the
      // driver refuses to guess. Number() it here rather than at every
      // call site.
      surfaceTempF: row.surface_temp_f === null ? null : Number(row.surface_temp_f),
      observedAt: row.observed_at,
      clarity: row.clarity,
      waterLevel: row.water_level,
      reportCount: Number(row.report_count ?? 0),
    };
  } catch {
    return NONE;
  }
}
