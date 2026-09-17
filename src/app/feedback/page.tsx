import type { Metadata } from "next";

import BackLink from "@/components/BackLink";
import FeedbackForm from "@/components/FeedbackForm";

export const metadata: Metadata = {
  title: "Send feedback",
  description: "Tell us what is wrong, missing or wanted in Honey Hole.",
};

export default function FeedbackPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10">
      <nav className="text-[11px] uppercase tracking-[0.16em] text-muted">
        <BackLink href="/" />
      </nav>

      <p className="mt-4 text-[11px] uppercase tracking-[0.2em] text-accent">Talk back</p>
      <h1 className="display mt-3 text-4xl font-semibold">Send feedback</h1>
      <p className="mt-3 text-muted text-pretty">
        Wrong depth on a lake? A bite rating that did not match what happened?
        Something you wish this did? This is a small app built by one person, and
        the fastest way it gets better is somebody saying what is wrong with it.
      </p>

      <FeedbackForm />
    </div>
  );
}
