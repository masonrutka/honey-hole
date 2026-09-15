import { Suspense } from "react";
import type { Metadata } from "next";

import BackLink from "@/components/BackLink";
import SignInForm from "@/components/SignInForm";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to report water conditions on Wisconsin lakes.",
  // A sign-in page has nothing worth indexing and competes with the lake
  // pages that do.
  robots: { index: false, follow: true },
};

export default function SignInPage() {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-10">
      <nav className="text-[11px] uppercase tracking-[0.16em] text-muted">
        <BackLink href="/" />
      </nav>

      <p className="mt-4 text-[11px] uppercase tracking-[0.2em] text-accent">Honey Hole</p>
      <h1 className="display mt-3 text-4xl font-semibold">Sign in</h1>
      <p className="mt-3 text-muted text-pretty">
        An account lets you report what the water is actually doing, and read what
        everyone else has reported. Lake data, regulations and the forecast stay
        free whether you sign in or not.
      </p>

      {/* useSearchParams() suspends, and this page is prerendered. Without a
          boundary the whole route would be pushed to client rendering. */}
      <Suspense fallback={<div className="mt-8 h-48" />}>
        <SignInForm />
      </Suspense>
    </div>
  );
}
