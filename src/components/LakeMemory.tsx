"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  subscribe, favoritesSnapshot, emptySnapshot, toggleFavorite, recordVisit,
  type SavedLake,
} from "@/lib/storage";

/**
 * Records that you looked at this lake, and lets you star it.
 *
 * Rendered on the lake page. Storage is per-browser, so the button has to mount
 * in an unknown state and settle after hydration -- rendering a definite
 * "not starred" on the server would flash the wrong state for a saved lake.
 */
export default function LakeMemory({ lake }: { lake: SavedLake }) {
  const favorites = useSyncExternalStore(subscribe, favoritesSnapshot, emptySnapshot);
  const saved = favorites.some((l) => l.wbic === lake.wbic);

  // Recording the visit is a genuine side effect, not derived state.
  const { wbic, name, county, acres } = lake;
  useEffect(() => {
    recordVisit({ wbic, name, county, acres });
  }, [wbic, name, county, acres]);

  return (
    <button
      onClick={() => toggleFavorite(lake)}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${lake.name} from saved` : `Save ${lake.name}`}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs
                  transition-colors ${
                    saved
                      ? "border-accent/60 bg-accent/10 text-accent"
                      : "border-edge text-muted hover:border-accent/60 hover:text-foreground"
                  }`}
    >
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden="true">
        <path
          d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z"
          fill={saved ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
      {saved ? "Saved" : "Save"}
    </button>
  );
}
