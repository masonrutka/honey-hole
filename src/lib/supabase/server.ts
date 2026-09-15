import "server-only";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { SUPABASE_KEY, SUPABASE_URL, isConfigured } from "./env";

/**
 * A Supabase client for Server Actions and Route Handlers -- anywhere that can
 * legitimately write cookies.
 *
 * A new one per request, never a module-level singleton: the client carries
 * that request's session, and the cache-control headers below are only
 * delivered on its first cookie write.
 */
export async function supabaseServer(): Promise<SupabaseClient | null> {
  if (!isConfigured()) return null;
  const store = await cookies();

  return createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll() {
        return store.getAll();
      },
      // Supabase also passes response headers (Cache-Control, Expires, Pragma)
      // to stop a CDN caching a response that sets an auth cookie. They are
      // ignored here on purpose: this client is only used from Server Actions
      // and Route Handlers, whose responses are not CDN-cacheable to begin
      // with, and Next's cookie store cannot set response headers -- passing
      // them to store.set() would write cookies literally named
      // "Cache-Control".
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            store.set(name, value, options);
          }
        } catch {
          // Called from a Server Component, which may not set cookies. Safe to
          // ignore: the browser client refreshes the session on its own, which
          // is why this app needs no proxy.ts to do it.
        }
      },
    },
  });
}

/**
 * Read-only, session-free client for public data.
 *
 * Reads only what Row Level Security exposes to anonymous visitors, and never
 * touches cookies, so it can be called from a Server Component on a route that
 * is statically generated without forcing that route to render per request.
 *
 * Worth knowing: the lake page, its only caller today, is already dynamic
 * because it awaits searchParams. This client is what keeps that from being a
 * requirement -- any prerendered page can use it.
 */
export function supabaseAnon(): SupabaseClient | null {
  if (!isConfigured()) return null;
  return createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll: () => [],
      setAll: () => {},
    },
  });
}
