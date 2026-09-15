"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";

import { supabaseBrowser } from "@/lib/supabase/client";

const ERRORS: Record<string, string> = {
  expired: "That sign-in link has already been used or has expired. Send another below.",
  missing: "That link was incomplete. Send another below.",
  unconfigured: "Accounts are not switched on for this deployment yet.",
};

export default function SignInForm() {
  const params = useSearchParams();
  // Where to go after signing in. Same-origin paths only: this ends up in a
  // redirect URL, and anything else is an open redirect.
  const raw = params.get("next") ?? "/";
  const next = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";

  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState<"google" | "email" | null>(null);
  const [error, setError] = useState<string | null>(ERRORS[params.get("error") ?? ""] ?? null);

  const supabase = supabaseBrowser();

  async function withGoogle() {
    if (!supabase) return setError(ERRORS.unconfigured);
    setBusy("google");
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (error) {
      setError(error.message);
      setBusy(null);
    }
    // On success the browser is already navigating to Google; leave the button
    // showing its busy state rather than flashing back to idle mid-redirect.
  }

  async function withEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return setError(ERRORS.unconfigured);
    setBusy("email");
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    setBusy(null);
    if (error) setError(error.message);
    else setSent(true);
  }

  if (sent) {
    return (
      <div className="mt-8 rounded-lg border border-accent/40 bg-accent/5 px-4 py-5">
        <p className="display text-lg">Check your email.</p>
        <p className="mt-2 text-sm text-muted">
          We sent a sign-in link to <span className="text-foreground">{email}</span>. It is
          good for one hour, and one use.
        </p>
        <button
          onClick={() => setSent(false)}
          className="mt-3 text-xs text-accent hover:underline"
        >
          Use a different address
        </button>
      </div>
    );
  }

  return (
    <div className="mt-8">
      <button
        onClick={withGoogle}
        disabled={busy !== null}
        className="flex w-full items-center justify-center gap-3 rounded-lg border border-edge
                   bg-surface-2 px-4 py-3 text-sm font-medium transition-colors
                   hover:border-accent/60 disabled:opacity-60"
      >
        <svg viewBox="0 0 18 18" className="h-4 w-4" aria-hidden="true">
          <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z" />
          <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z" />
          <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z" />
          <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z" />
        </svg>
        {busy === "google" ? "Opening Google…" : "Continue with Google"}
      </button>

      <div className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-[0.18em] text-muted">
        <span className="h-px flex-1 bg-edge" />
        or
        <span className="h-px flex-1 bg-edge" />
      </div>

      <form onSubmit={withEmail}>
        <label htmlFor="email" className="text-[11px] uppercase tracking-[0.14em] text-muted">
          Email a sign-in link
        </label>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="flex-1 rounded-lg border border-edge bg-surface px-3 py-3 text-base
                       outline-none focus:border-accent/60"
          />
          <button
            type="submit"
            disabled={busy !== null}
            className="rounded-lg border border-accent/60 bg-accent/10 px-4 py-3 text-sm
                       font-medium text-accent transition-colors hover:bg-accent/20
                       disabled:opacity-60"
          >
            {busy === "email" ? "Sending…" : "Send link"}
          </button>
        </div>
      </form>

      {error && <p className="mt-3 text-sm text-slow">{error}</p>}

      <p className="mt-6 text-xs text-muted">
        No password to forget. We store your email address and nothing else you
        have not typed in yourself.
      </p>
    </div>
  );
}
