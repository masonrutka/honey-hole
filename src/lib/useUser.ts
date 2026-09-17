"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";

import { supabaseBrowser } from "./supabase/client";
import { isConfigured } from "./supabase/env";

export interface SessionState {
  /** Undefined until the first check finishes -- "unknown", not "signed out". */
  user: User | null | undefined;
  loading: boolean;
}

/**
 * The signed-in user, read in the browser.
 *
 * Reading the session on the server would mean reading cookies, and a cookie
 * read anywhere in a route's tree opts that route out of static generation.
 * This drives the account control in the root layout, so it is in *every*
 * route's tree -- including the home, species and about pages, which are
 * genuinely prerendered. Giving all of that up to put a name in the header
 * would be a bad trade.
 *
 * Nothing secret is decided here: this chooses which buttons appear, while
 * every actual write is checked again in a Server Action and once more by Row
 * Level Security.
 *
 * `user` is deliberately three-valued. A signed-in visitor whose header flashes
 * "Sign in" for a moment on every page load looks broken, so callers render
 * nothing at all while it is undefined.
 */
export function useUser(): SessionState {
  // With no backend there is nothing to wait for, so start at "signed out"
  // rather than at "unknown" and correcting it from an effect.
  const [user, setUser] = useState<User | null | undefined>(() =>
    isConfigured() ? undefined : null,
  );

  useEffect(() => {
    const supabase = supabaseBrowser();
    if (!supabase) return;

    let active = true;
    // getUser() revalidates the token with Supabase rather than trusting
    // whatever is in the cookie, which getSession() does not.
    supabase.auth.getUser().then(({ data }) => {
      if (active) setUser(data.user ?? null);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setUser(session?.user ?? null);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { user, loading: user === undefined };
}
