"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { supabaseBrowser } from "@/lib/supabase/client";
import { isConfigured } from "@/lib/supabase/env";
import { useUser } from "@/lib/useUser";

/**
 * The account control in the header.
 *
 * Renders a fixed-width placeholder until the session is known. The header is
 * in the prerendered shell, so showing "Sign in" first and swapping it for a
 * username a moment later would shift the nav on every single page load.
 */
export default function AuthMenu() {
  const { user, loading } = useUser();
  const pathname = usePathname();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  // Nothing to offer when there is no backend configured.
  if (!isConfigured()) return null;

  if (loading) return <span className="w-14" aria-hidden="true" />;

  if (!user) {
    return (
      <Link
        href={`/signin?next=${encodeURIComponent(pathname)}`}
        className="text-muted transition-colors hover:text-foreground"
      >
        Sign in
      </Link>
    );
  }

  const name =
    (user.user_metadata?.name as string | undefined)?.split(" ")[0] ??
    user.email?.split("@")[0] ??
    "Account";

  async function signOut() {
    const supabase = supabaseBrowser();
    if (!supabase) return;
    setBusy(true);
    await supabase.auth.signOut();
    setBusy(false);
    // The server-rendered parts of the page were built for whoever was signed
    // in a moment ago. Refresh so nothing stale is left behind.
    router.refresh();
  }

  return (
    <span className="flex items-center gap-3">
      <span className="hidden text-muted sm:inline" title={user.email ?? undefined}>
        {name}
      </span>
      <button
        onClick={signOut}
        disabled={busy}
        className="text-muted transition-colors hover:text-foreground disabled:opacity-50"
      >
        {busy ? "…" : "Sign out"}
      </button>
    </span>
  );
}
