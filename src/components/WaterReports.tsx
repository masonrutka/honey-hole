"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import { can, viewsRemaining } from "@/lib/access";
import { supabaseBrowser } from "@/lib/supabase/client";
import { isConfigured } from "@/lib/supabase/env";
import { recordFeedView, feedsSnapshot, noFeeds, subscribe } from "@/lib/storage";
import { useUser } from "@/lib/useUser";
import { submitWaterReport, deleteWaterReport } from "@/app/actions/reports";

interface Report {
  id: string;
  user_id: string;
  observed_at: string;
  surface_temp_f: number | string | null;
  clarity: string | null;
  water_level: string | null;
  activity: string | null;
  note: string | null;
  profiles: { username: string; display_name: string | null } | null;
}

const ACTIVITY_LABEL: Record<string, string> = {
  hot: "Biting hard",
  steady: "Steady",
  slow: "Slow",
  dead: "Nothing doing",
};

function ago(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (!Number.isFinite(mins)) return "";
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function titled(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * What people have reported about this lake, and the form to add to it.
 *
 * Client-rendered on purpose. The lake page is prerendered and revalidated
 * hourly; fetching reports on the server would either serve an hour-old feed
 * or force the whole route to render per request. Neither is worth it for a
 * section that is inherently live.
 */
export default function WaterReports({ wbic, lakeName }: { wbic: number; lakeName: string }) {
  const { user, loading } = useUser();
  const pathname = usePathname();

  const [reports, setReports] = useState<Report[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [showForm, setShowForm] = useState(false);

  // The meter is localStorage, which React does not own. Subscribing to it the
  // same way LakeMemory subscribes to favourites keeps the count in sync
  // across tabs and avoids deriving state in an effect.
  const seen = useSyncExternalStore(subscribe, feedsSnapshot, noFeeds);

  /**
   * Fetch the feed. Returns the rows rather than setting state, so the caller
   * decides whether its result is still wanted -- and so the only place state
   * changes is a callback, not the middle of an awaited function.
   */
  const fetchReports = useCallback(async (): Promise<Report[] | "error"> => {
    const supabase = supabaseBrowser();
    if (!supabase) return "error";
    const { data, error } = await supabase
      .from("water_reports")
      .select("id,user_id,observed_at,surface_temp_f,clarity,water_level,activity,note,profiles(username,display_name)")
      .eq("wbic", wbic)
      .is("hidden_at", null)
      .order("observed_at", { ascending: false })
      .limit(20);

    if (error) return "error";
    return (data ?? []) as unknown as Report[];
  }, [wbic]);

  const apply = useCallback((result: Report[] | "error") => {
    if (result === "error") setFailed(true);
    else {
      setFailed(false);
      setReports(result);
    }
  }, []);

  /** Re-read the feed after this visitor changed it. */
  const refresh = useCallback(() => {
    void fetchReports().then(apply);
  }, [fetchReports, apply]);

  // Recording the view is a write to an external system, which is what an
  // effect is for. Only signed-out visitors are metered at all.
  useEffect(() => {
    if (loading || user) return;
    recordFeedView(wbic);
  }, [loading, user, wbic]);

  const visitor = { signedIn: Boolean(user), lakeFeedsViewed: user ? 0 : seen.length };
  const mayRead = can("view_report_feed", visitor);
  const mayPost = can("post_report", visitor);

  useEffect(() => {
    if (loading || !mayRead.allowed) return;
    let cancelled = false;
    void fetchReports().then((result) => {
      // Without this, switching lakes quickly can let an earlier lake's
      // reports land after the current one's, under the wrong heading.
      if (!cancelled) apply(result);
    });
    return () => {
      cancelled = true;
    };
  }, [loading, mayRead.allowed, fetchReports, apply]);

  // No backend configured: this section simply does not exist.
  if (!isConfigured()) return null;

  const signInHref = `/signin?next=${encodeURIComponent(pathname)}`;
  const remaining = viewsRemaining(visitor);

  return (
    <section className="mt-10">
      <h2 className="rule-tick flex flex-wrap items-baseline gap-x-3 pt-3 text-[11px] uppercase tracking-[0.18em] text-muted">
        Water reports
        {mayRead.allowed && !user && Number.isFinite(remaining) && (
          <span className="normal-case tracking-normal text-[11px] text-muted/80">
            {remaining} free {remaining === 1 ? "lake" : "lakes"} left
          </span>
        )}
      </h2>

      {!mayRead.allowed ? (
        <Prompt href={signInHref} text={mayRead.prompt} />
      ) : (
        <>
          <div className="mt-3">
            {mayPost.allowed ? (
              showForm ? (
                <ReportForm
                  wbic={wbic}
                  lakeName={lakeName}
                  onDone={() => {
                    setShowForm(false);
                    refresh();
                  }}
                  onCancel={() => setShowForm(false)}
                />
              ) : (
                <button
                  onClick={() => setShowForm(true)}
                  className="rounded-lg border border-accent/60 bg-accent/10 px-3 py-2 text-xs
                             font-medium text-accent transition-colors hover:bg-accent/20"
                >
                  Report conditions
                </button>
              )
            ) : (
              <Prompt href={signInHref} text={mayPost.prompt} compact />
            )}
          </div>

          {failed ? (
            <p className="mt-4 text-sm text-muted">
              Reports could not be loaded. Everything above is unaffected.
            </p>
          ) : reports === null ? (
            <p className="mt-4 text-sm text-muted">Loading reports…</p>
          ) : reports.length === 0 ? (
            <p className="mt-4 text-sm text-muted text-pretty">
              Nobody has reported conditions on {lakeName} yet. Until somebody does,
              the water temperature above is estimated from air temperature.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-edge/70 overflow-hidden rounded-lg border border-edge">
              {reports.map((r) => (
                <ReportRow
                  key={r.id}
                  report={r}
                  wbic={wbic}
                  mine={r.user_id === user?.id}
                  onRemoved={refresh}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

function Prompt({ href, text, compact }: { href: string; text: string; compact?: boolean }) {
  return (
    <div
      className={`rounded-lg border border-accent/30 bg-accent/5 px-4 ${
        compact ? "py-3" : "mt-3 py-5"
      }`}
    >
      <p className="text-sm text-pretty">{text}</p>
      <Link
        href={href}
        className="mt-2 inline-block text-sm font-medium text-accent hover:underline"
      >
        Sign in or create an account →
      </Link>
    </div>
  );
}

function ReportRow({
  report,
  wbic,
  mine,
  onRemoved,
}: {
  report: Report;
  wbic: number;
  mine: boolean;
  onRemoved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const temp = report.surface_temp_f === null ? null : Number(report.surface_temp_f);

  const facts = [
    temp === null ? null : `${temp}°F`,
    report.clarity ? titled(report.clarity) : null,
    report.water_level ? `${titled(report.water_level)} water` : null,
    report.activity ? ACTIVITY_LABEL[report.activity] : null,
  ].filter((f): f is string => f !== null);

  const who = report.profiles?.display_name ?? report.profiles?.username ?? "someone";

  return (
    <li className="bg-surface px-4 py-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
        <span className="font-medium tabular-nums">{facts.join(" · ") || "Note"}</span>
        <span className="ml-auto whitespace-nowrap text-xs text-muted">
          {who} · {ago(report.observed_at)}
        </span>
      </div>
      {report.note && <p className="mt-1 text-sm text-muted text-pretty">{report.note}</p>}
      {mine && (
        <button
          onClick={async () => {
            setBusy(true);
            await deleteWaterReport(report.id, wbic);
            setBusy(false);
            onRemoved();
          }}
          disabled={busy}
          className="mt-1 text-[11px] text-muted underline hover:text-slow disabled:opacity-50"
        >
          {busy ? "Removing…" : "Remove"}
        </button>
      )}
    </li>
  );
}

function ReportForm({
  wbic,
  lakeName,
  onDone,
  onCancel,
}: {
  wbic: number;
  lakeName: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const data = new FormData(e.currentTarget);
    // Send an absolute instant rather than a local wall-clock string. The
    // server has no idea what timezone the angler is standing in.
    data.set("observed_ms", String(Date.now()));
    const result = await submitWaterReport(data);
    setBusy(false);
    if (result.ok) onDone();
    else setError(result.error);
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-lg border border-edge bg-surface px-4 py-4"
    >
      <input type="hidden" name="wbic" value={wbic} />
      <p className="text-[11px] uppercase tracking-[0.14em] text-muted">
        Conditions on {lakeName} right now
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="text-muted">Surface temp (°F)</span>
          <input
            name="surface_temp_f"
            type="number"
            step="0.1"
            min="32"
            max="100"
            inputMode="decimal"
            placeholder="68.5"
            className="mt-1 w-full rounded-lg border border-edge bg-surface-2 px-3 py-2
                       text-base outline-none focus:border-accent/60"
          />
        </label>

        <Select name="clarity" label="Clarity" options={["clear", "stained", "murky"]} />
        <Select name="water_level" label="Water level" options={["low", "normal", "high"]} />
        <Select
          name="activity"
          label="Were they biting?"
          options={["hot", "steady", "slow", "dead"]}
          labels={ACTIVITY_LABEL}
        />
      </div>

      <label className="mt-3 block text-sm">
        <span className="text-muted">Anything else (optional)</span>
        <input
          name="note"
          maxLength={280}
          placeholder="Weeds thick on the north bar"
          className="mt-1 w-full rounded-lg border border-edge bg-surface-2 px-3 py-2
                     text-base outline-none focus:border-accent/60"
        />
      </label>

      {error && <p className="mt-3 text-sm text-slow">{error}</p>}

      <div className="mt-4 flex items-center gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg border border-accent/60 bg-accent/10 px-4 py-2 text-sm
                     font-medium text-accent transition-colors hover:bg-accent/20
                     disabled:opacity-60"
        >
          {busy ? "Posting…" : "Post report"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-2 py-2 text-sm text-muted hover:text-foreground"
        >
          Cancel
        </button>
      </div>
      <p className="mt-3 text-xs text-muted">
        Posted under your account name, visible to everyone. You can remove it later.
      </p>
    </form>
  );
}

function Select({
  name,
  label,
  options,
  labels,
}: {
  name: string;
  label: string;
  options: string[];
  labels?: Record<string, string>;
}) {
  return (
    <label className="text-sm">
      <span className="text-muted">{label}</span>
      <select
        name={name}
        defaultValue=""
        className="mt-1 w-full rounded-lg border border-edge bg-surface-2 px-3 py-2
                   text-base outline-none focus:border-accent/60"
      >
        <option value="">—</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {labels?.[o] ?? titled(o)}
          </option>
        ))}
      </select>
    </label>
  );
}
