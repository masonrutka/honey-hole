import { NextResponse } from "next/server";

import { supabaseServer } from "@/lib/supabase/server";

/**
 * Where Google and the emailed sign-in links land.
 *
 * Two shapes arrive here. OAuth and PKCE magic links carry a `code` to be
 * exchanged for a session; the older email templates carry `token_hash` and
 * `type` instead. Both are handled so that changing an email template in the
 * Supabase dashboard cannot quietly break sign-in.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");

  // Only ever redirect somewhere on this site. `next` comes from a URL, and a
  // link that carries a session and then forwards to another origin is an open
  // redirect -- a real one, because the visitor is authenticated by the time it
  // fires.
  const requested = url.searchParams.get("next") ?? "/";
  const next = requested.startsWith("/") && !requested.startsWith("//") ? requested : "/";

  const supabase = await supabaseServer();
  if (!supabase) {
    return NextResponse.redirect(new URL("/signin?error=unconfigured", url.origin));
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
    return NextResponse.redirect(new URL("/signin?error=expired", url.origin));
  }

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type: type as "magiclink" | "email" | "signup" | "recovery",
      token_hash: tokenHash,
    });
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
    return NextResponse.redirect(new URL("/signin?error=expired", url.origin));
  }

  return NextResponse.redirect(new URL("/signin?error=missing", url.origin));
}
