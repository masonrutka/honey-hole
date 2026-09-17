/**
 * Where the line between "free to everyone" and "needs an account" sits.
 *
 * Everything about that decision lives in this one file on purpose. It is a
 * product judgement, not an engineering one, and it will be argued with and
 * changed; it should never be spread across a dozen components where moving it
 * means hunting for conditions.
 *
 * The rule chosen here: the Wisconsin DNR data is never gated, and everything
 * people contribute is. The lake pages are what search engines index and what
 * people paste into a text message -- putting a wall in front of them trades
 * away the way new visitors arrive in exchange for signups from visitors who
 * have not yet been given a reason to sign up. What a stranger just posted
 * about a lake this morning is a genuinely new thing, and asking for an
 * account to see it is a fair trade.
 */

/** The dials. Everything below derives from these. */
export const GATE = {
  /**
   * How many different lakes' report feeds a signed-out visitor may read
   * before being asked to sign in. The newest report on a lake always shows,
   * gated or not, because it feeds the forecast.
   */
  freeLakeReportViews: 3,

  /**
   * Flip to true to require an account to view lake pages at all.
   *
   * Left off deliberately. See the note above -- turning this on costs search
   * traffic and shared links, which is currently where every visitor comes
   * from. If it goes on, the sign-in wall must let crawlers through or the
   * lake pages fall out of Google entirely.
   */
  gateLakePages: false,
} as const;

/** Everything a signed-out visitor might run into. */
export type Capability =
  | "view_lake"
  | "view_latest_conditions"
  | "view_report_feed"
  | "post_report"
  | "sync_saved_lakes"
  | "send_feedback";

export interface Visitor {
  signedIn: boolean;
  /** How many distinct lakes' feeds this visitor has already opened. */
  lakeFeedsViewed: number;
}

export type Decision =
  | { allowed: true }
  | { allowed: false; reason: "sign_in_required" | "limit_reached"; prompt: string };

const ALLOW: Decision = { allowed: true };

/**
 * May this visitor do this?
 *
 * Pure, so the rules can be tested without a browser, a session or a database,
 * and so the same function decides what the server enforces and what the UI
 * offers. A UI that offers something the server then refuses is worse than no
 * UI at all.
 */
export function can(capability: Capability, visitor: Visitor): Decision {
  if (visitor.signedIn) return ALLOW;

  switch (capability) {
    // Free to everyone, signed in or not. This is the DNR's data and the
    // forecast built on it, and it is the reason anyone arrives at all.
    case "view_latest_conditions":
    case "send_feedback":
      return ALLOW;

    case "view_lake":
      return GATE.gateLakePages
        ? {
            allowed: false,
            reason: "sign_in_required",
            prompt: "Create a free account to explore Wisconsin's lakes.",
          }
        : ALLOW;

    case "view_report_feed":
      if (visitor.lakeFeedsViewed < GATE.freeLakeReportViews) return ALLOW;
      return {
        allowed: false,
        reason: "limit_reached",
        prompt: `You've read reports on ${GATE.freeLakeReportViews} lakes. Create a free account to keep reading.`,
      };

    case "post_report":
      return {
        allowed: false,
        reason: "sign_in_required",
        prompt: "Create a free account to report what the water is doing.",
      };

    case "sync_saved_lakes":
      return {
        allowed: false,
        reason: "sign_in_required",
        prompt: "Create a free account to keep your saved lakes across devices.",
      };
  }
}

/** How many free feed views are left, for the "2 of 3 left" nudge. */
export function viewsRemaining(visitor: Visitor): number {
  if (visitor.signedIn) return Infinity;
  return Math.max(0, GATE.freeLakeReportViews - visitor.lakeFeedsViewed);
}
