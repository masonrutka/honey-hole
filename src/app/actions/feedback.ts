"use server";

import { supabaseServer } from "@/lib/supabase/server";
import type { ActionResult } from "./reports";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/**
 * Deliberately conservative. This address is interpolated into an outbound
 * mail header, so the question is not "could this be delivered" but "is this
 * definitely free of anything that could break out of a header".
 */
const EMAIL_RE = /^[^\s@<>,;:"'\\]+@[^\s@<>,;:"'\\]+\.[^\s@<>,;:"'\\]{2,}$/;

function validEmail(value: string): boolean {
  return value.length <= 254 && EMAIL_RE.test(value);
}

/** Strip anything that could start a new header line, plus other controls. */
function headerSafe(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 120);
}

/**
 * Mail a copy of the feedback.
 *
 * Called with the row already saved, and never allowed to fail the action:
 * the database is the record of what was said, and email is a convenience on
 * top of it. Sending is done with fetch rather than the Resend SDK to keep one
 * more package, and one more thing to keep updated, out of the tree.
 */
async function notify(message: string, from: string, path: string | null): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.FEEDBACK_TO_EMAIL;
  // Until a domain is verified with Resend, onboarding@resend.dev is the only
  // address they will send from, and only to the account's own address.
  const sender = process.env.FEEDBACK_FROM_EMAIL ?? "Honey Hole <onboarding@resend.dev>";
  if (!key || !to) return;

  try {
    await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: sender,
        to: [to],
        subject: `Honey Hole feedback from ${headerSafe(from)}`,
        // Plain text, and the message is never interpolated into HTML, so
        // nothing a stranger types can become markup in your inbox.
        text: [
          message,
          "",
          "---",
          `From: ${from}`,
          path ? `Page: ${path}` : null,
        ]
          .filter((l) => l !== null)
          .join("\n"),
        // Only ever a validated address, and only when it is one. An
        // unvalidated string here lets an anonymous sender attribute their
        // message to somebody who never wrote it.
        reply_to: validEmail(from) ? from : undefined,
      }),
    });
  } catch {
    // Resend down, or a bad key. The row is already saved.
  }
}

/**
 * Send feedback about the app.
 *
 * Open to signed-out visitors deliberately: someone who cannot work out how to
 * sign in is exactly the person whose feedback is worth the most.
 */
export async function sendFeedback(formData: FormData): Promise<ActionResult> {
  const message = String(formData.get("message") ?? "").trim();
  if (message.length < 2) return { ok: false, error: "Tell me a little more than that." };
  if (message.length > 2000) return { ok: false, error: "That is longer than 2,000 characters." };

  const rawEmail = String(formData.get("email") ?? "").trim();
  // An unparseable address is dropped rather than rejected. It is optional,
  // and refusing the whole message over a typo in a field nobody had to fill
  // in would lose the feedback, which is the only thing here that matters.
  const typedEmail = validEmail(rawEmail) ? rawEmail : "";
  const path = String(formData.get("path") ?? "").trim().slice(0, 200) || null;

  const supabase = await supabaseServer();
  if (!supabase) return { ok: false, error: "Feedback is not available right now." };

  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user ?? null;
  const email = user?.email ?? (typedEmail || null);

  const { error } = await supabase.from("feedback").insert({
    user_id: user?.id ?? null,
    email,
    message,
    path,
  });

  if (error) {
    // Raised by the enforce_feedback_rules trigger.
    if (error.code === "HH001") {
      return { ok: false, error: "That is a lot of feedback for one day. Try again tomorrow." };
    }
    return { ok: false, error: "That could not be sent. Try again." };
  }

  await notify(message, email ?? "someone signed out", path);
  return { ok: true };
}
