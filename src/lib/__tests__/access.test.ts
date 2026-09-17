import { describe, expect, it } from "vitest";

import { GATE, can, viewsRemaining, type Visitor } from "../access";

const signedOut = (lakeFeedsViewed = 0): Visitor => ({ signedIn: false, lakeFeedsViewed });
const signedIn: Visitor = { signedIn: true, lakeFeedsViewed: 999 };

describe("access policy", () => {
  it("never gates the DNR data or the forecast", () => {
    expect(can("view_lake", signedOut()).allowed).toBe(true);
    expect(can("view_latest_conditions", signedOut(999)).allowed).toBe(true);
  });

  it("lets anyone send feedback, including signed-out visitors", () => {
    // Someone who cannot work out how to sign in is exactly the person whose
    // feedback is most worth having.
    expect(can("send_feedback", signedOut()).allowed).toBe(true);
  });

  it("always requires an account to post a report", () => {
    const d = can("post_report", signedOut());
    expect(d.allowed).toBe(false);
    expect(d.allowed === false && d.reason).toBe("sign_in_required");
  });

  it("allows exactly the configured number of free feed views", () => {
    for (let i = 0; i < GATE.freeLakeReportViews; i++) {
      expect(can("view_report_feed", signedOut(i)).allowed).toBe(true);
    }
    expect(can("view_report_feed", signedOut(GATE.freeLakeReportViews)).allowed).toBe(false);
  });

  it("keeps the limit closed once passed, not just at the boundary", () => {
    expect(can("view_report_feed", signedOut(GATE.freeLakeReportViews + 50)).allowed).toBe(false);
  });

  it("gates nothing at all for a signed-in user", () => {
    const every = [
      "view_lake", "view_latest_conditions", "view_report_feed",
      "post_report", "sync_saved_lakes", "send_feedback",
    ] as const;
    for (const c of every) expect(can(c, signedIn).allowed).toBe(true);
  });

  it("never reports a negative number of views remaining", () => {
    expect(viewsRemaining(signedOut(GATE.freeLakeReportViews + 10))).toBe(0);
    expect(viewsRemaining(signedIn)).toBe(Infinity);
  });

  it("gives a prompt worth showing whenever it refuses", () => {
    // A refusal with no explanation is a dead end for the visitor.
    const refusals = [
      can("post_report", signedOut()),
      can("view_report_feed", signedOut(GATE.freeLakeReportViews)),
      can("sync_saved_lakes", signedOut()),
    ];
    for (const d of refusals) {
      expect(d.allowed).toBe(false);
      expect(d.allowed === false && d.prompt.length).toBeGreaterThan(10);
    }
  });
});
