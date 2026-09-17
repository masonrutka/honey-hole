"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

const MOVED_KEY = "honeyhole:moved";

/**
 * Records that this tab has navigated inside the app at least once.
 *
 * Mounted in the root layout so it sees every route change, including the ones
 * that happen on pages with no back link of their own (the home page, mostly).
 * sessionStorage rather than a module variable because it has the same lifetime
 * as the tab's history: reloading a lake page does not erase the entry behind
 * it, and neither should this.
 */
export function NavTracker() {
  const pathname = usePathname();
  const first = useRef(true);

  useEffect(() => {
    // The first pathname is the page we landed on, not somewhere we went.
    if (first.current) {
      first.current = false;
      return;
    }
    try {
      sessionStorage.setItem(MOVED_KEY, "1");
    } catch {
      // Storage blocked. The link still works, it just always uses its href.
    }
  }, [pathname]);

  return null;
}

/**
 * True when going back lands on another page of this site rather than dumping
 * the visitor wherever they came from -- a search result, a text message, a
 * forum post. Checked at click time, not at mount: effects in child components
 * run before those in the layout, so at mount the tracker may not have written
 * its flag yet.
 */
function backStaysInside(): boolean {
  try {
    // A tab opened fresh on this page has nothing behind it. Chrome copies
    // sessionStorage into tabs opened with target="_blank", so the flag alone
    // is not enough.
    if (window.history.length <= 1) return false;
    if (sessionStorage.getItem(MOVED_KEY) === "1") return true;
    // Arrived by a full page load from elsewhere on the site.
    if (!document.referrer) return false;
    return new URL(document.referrer).origin === window.location.origin;
  } catch {
    return false;
  }
}

/**
 * A back link that actually goes back where it can, and to `href` where it
 * cannot.
 *
 * It stays a real anchor so it can be opened in a new tab, focused, and read
 * by a screen reader as a link. `router.back()` alone would send anyone who
 * opened a shared lake link straight off the site.
 */
export default function BackLink({
  href,
  label = "Back",
}: {
  href: string;
  label?: string;
}) {
  const router = useRouter();

  return (
    <Link
      href={href}
      onClick={(e) => {
        // Leave modified clicks alone -- those mean "new tab", "new window",
        // "download", and hijacking them is exactly the sort of thing that
        // makes a site feel broken.
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        if (!backStaysInside()) return;
        e.preventDefault();
        router.back();
      }}
      className="group inline-flex items-center gap-1.5 text-muted transition-colors hover:text-accent"
    >
      <svg viewBox="0 0 16 16" className="h-3 w-3" aria-hidden="true">
        <path
          d="M10 3 5 8l5 5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="transition-transform group-hover:-translate-x-0.5"
        />
      </svg>
      {label}
    </Link>
  );
}
