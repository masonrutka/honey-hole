"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { SUPABASE_KEY, SUPABASE_URL, isConfigured } from "./env";

let cached: SupabaseClient | null = null;

/**
 * The browser's Supabase client, or null when there is no backend configured.
 *
 * One instance per tab: each client starts its own token-refresh timer and
 * its own auth listener, so creating them per render would multiply both.
 *
 * Returning null rather than throwing is deliberate. Every caller is a piece
 * of optional UI -- a sign-in button, a report form -- and a static build with
 * no environment variables should render the app without them, not crash.
 */
export function supabaseBrowser(): SupabaseClient | null {
  if (!isConfigured()) return null;
  if (!cached) cached = createBrowserClient(SUPABASE_URL, SUPABASE_KEY);
  return cached;
}
