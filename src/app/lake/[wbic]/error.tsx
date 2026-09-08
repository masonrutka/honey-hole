"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function LakeError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-20 text-center">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="mt-2 text-muted">
        This lake&rsquo;s page failed to load. That is usually a hiccup fetching live
        weather — trying again often fixes it.
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <button
          onClick={reset}
          className="rounded-lg border border-edge bg-surface px-4 py-2 text-sm
                     hover:border-accent hover:text-accent transition-colors"
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded-lg border border-edge bg-surface px-4 py-2 text-sm
                     hover:border-accent hover:text-accent transition-colors"
        >
          Back to search
        </Link>
      </div>
    </div>
  );
}
