"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";

import { sendFeedback } from "@/app/actions/feedback";
import { isConfigured } from "@/lib/supabase/env";
import { useUser } from "@/lib/useUser";

export default function FeedbackForm() {
  const { user } = useUser();
  const pathname = usePathname();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isConfigured()) {
    return (
      <p className="mt-6 text-sm text-muted">
        Feedback is not switched on for this deployment. Nothing is lost -- there
        is simply nowhere to send it yet.
      </p>
    );
  }

  if (sent) {
    return (
      <div className="mt-8 rounded-lg border border-accent/40 bg-accent/5 px-4 py-5">
        <p className="display text-lg">Thank you — that came through.</p>
        <p className="mt-2 text-sm text-muted">
          It goes straight to the person who built this.
        </p>
        <button onClick={() => setSent(false)} className="mt-3 text-xs text-accent hover:underline">
          Send something else
        </button>
      </div>
    );
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const data = new FormData(e.currentTarget);
    data.set("path", pathname);
    const result = await sendFeedback(data);
    setBusy(false);
    if (result.ok) setSent(true);
    else setError(result.error);
  }

  return (
    <form onSubmit={onSubmit} className="mt-8">
      <label className="block text-sm">
        <span className="text-[11px] uppercase tracking-[0.14em] text-muted">
          What is on your mind?
        </span>
        <textarea
          name="message"
          required
          rows={6}
          maxLength={2000}
          placeholder="A lake with the wrong depth, a bite rating that felt off, something you wish this did…"
          className="mt-2 w-full rounded-lg border border-edge bg-surface px-3 py-3 text-base
                     outline-none focus:border-accent/60"
        />
      </label>

      {!user && (
        <label className="mt-3 block text-sm">
          <span className="text-[11px] uppercase tracking-[0.14em] text-muted">
            Email (optional, only so you can be replied to)
          </span>
          <input
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            className="mt-2 w-full rounded-lg border border-edge bg-surface px-3 py-3 text-base
                       outline-none focus:border-accent/60"
          />
        </label>
      )}

      {error && <p className="mt-3 text-sm text-slow">{error}</p>}

      <button
        type="submit"
        disabled={busy}
        className="mt-4 rounded-lg border border-accent/60 bg-accent/10 px-4 py-3 text-sm
                   font-medium text-accent transition-colors hover:bg-accent/20 disabled:opacity-60"
      >
        {busy ? "Sending…" : "Send it"}
      </button>
    </form>
  );
}
