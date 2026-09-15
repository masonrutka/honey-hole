"use server";

import { revalidatePath } from "next/cache";

import { supabaseServer } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; error: string };

const CLARITY = ["clear", "stained", "murky"] as const;
const LEVEL = ["low", "normal", "high"] as const;
const ACTIVITY = ["hot", "steady", "slow", "dead"] as const;

/** Narrow a free-form field to one of its allowed values, or nothing. */
function oneOf<T extends readonly string[]>(
  value: FormDataEntryValue | null,
  allowed: T,
): T[number] | null {
  const s = typeof value === "string" ? value.trim() : "";
  return (allowed as readonly string[]).includes(s) ? (s as T[number]) : null;
}

/**
 * Record what the water is doing on a lake.
 *
 * Everything here is validated a second time by the table's check constraints
 * and a third by Row Level Security. That is not redundancy for its own sake:
 * a Server Action is a public HTTP endpoint, and the form is only one of the
 * things that can call it. The checks here exist to produce a decent error
 * message, not to be the thing that keeps bad rows out.
 */
export async function submitWaterReport(formData: FormData): Promise<ActionResult> {
  const supabase = await supabaseServer();
  if (!supabase) return { ok: false, error: "Reports are not available right now." };

  // getUser() verifies the token with Supabase. getSession() would believe
  // whatever the cookie claims, which is not good enough to attribute a write.
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) return { ok: false, error: "Sign in to post a report." };

  const wbic = Number(formData.get("wbic"));
  if (!Number.isInteger(wbic) || wbic <= 0) {
    return { ok: false, error: "That lake could not be identified." };
  }

  const rawTemp = String(formData.get("surface_temp_f") ?? "").trim();
  let surfaceTempF: number | null = null;
  if (rawTemp !== "") {
    const n = Number(rawTemp);
    if (!Number.isFinite(n) || n < 32 || n > 100) {
      return { ok: false, error: "Water temperature should be between 32 and 100°F." };
    }
    surfaceTempF = Math.round(n * 10) / 10;
  }

  const clarity = oneOf(formData.get("clarity"), CLARITY);
  const waterLevel = oneOf(formData.get("water_level"), LEVEL);
  const activity = oneOf(formData.get("activity"), ACTIVITY);

  const note = String(formData.get("note") ?? "").trim().slice(0, 280) || null;

  if (surfaceTempF === null && !clarity && !waterLevel && !activity && !note) {
    return { ok: false, error: "Add at least one observation." };
  }

  // The form posts a local datetime with no zone. Interpreting it as UTC would
  // shift a Wisconsin reading by five or six hours, which is enough to make a
  // fresh report look stale. Trust the browser's own instant instead, and only
  // fall back to now.
  const observedMs = Number(formData.get("observed_ms"));
  const observedAt = Number.isFinite(observedMs) && observedMs > 0
    ? new Date(observedMs)
    : new Date();

  const now = Date.now();
  if (observedAt.getTime() > now + 60 * 60 * 1000) {
    return { ok: false, error: "That time is in the future." };
  }
  if (observedAt.getTime() < now - 14 * 24 * 60 * 60 * 1000) {
    return { ok: false, error: "Reports older than two weeks are not accepted." };
  }

  const { error } = await supabase.from("water_reports").insert({
    user_id: user.id,
    wbic,
    observed_at: observedAt.toISOString(),
    surface_temp_f: surfaceTempF,
    clarity,
    water_level: waterLevel,
    activity,
    note,
  });

  if (error) {
    // The daily cap lives in the insert policy, so hitting it surfaces as a
    // policy violation rather than a friendly message.
    if (error.code === "42501") {
      return { ok: false, error: "That is a lot of reports for one day. Try again tomorrow." };
    }
    return { ok: false, error: "That report could not be saved. Try again." };
  }

  // The conditions panel caches for an hour; a new reading should show up on
  // the lake page now, not eventually.
  revalidatePath(`/lake/${wbic}`);
  return { ok: true };
}

export async function deleteWaterReport(id: string, wbic: number): Promise<ActionResult> {
  const supabase = await supabaseServer();
  if (!supabase) return { ok: false, error: "Reports are not available right now." };

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, error: "Sign in first." };

  // No ownership check here on purpose -- the delete policy allows only
  // auth.uid() = user_id, so someone else's id simply matches no rows.
  const { error } = await supabase.from("water_reports").delete().eq("id", id);
  if (error) return { ok: false, error: "That report could not be removed." };

  revalidatePath(`/lake/${wbic}`);
  return { ok: true };
}
