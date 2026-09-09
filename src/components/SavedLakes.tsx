"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import {
  subscribe, favoritesSnapshot, recentSnapshot, emptySnapshot, type SavedLake,
} from "@/lib/storage";

function LakeRow({ lake }: { lake: SavedLake }) {
  return (
    <li>
      <Link
        href={`/lake/${lake.wbic}`}
        className="flex items-baseline gap-3 rounded-lg border border-edge bg-surface px-4 py-2.5
                   hover:border-accent/60 hover:bg-surface-2 transition-colors"
      >
        <span className="font-medium text-sm">{lake.name}</span>
        <span className="text-xs text-muted">
          {lake.county ? `${lake.county} County` : "Wisconsin"}
        </span>
        <span className="ml-auto text-xs text-muted whitespace-nowrap">
          {lake.acres.toLocaleString()} ac
        </span>
      </Link>
    </li>
  );
}

/**
 * Your saved and recently viewed lakes.
 *
 * Renders nothing until it has read storage, and nothing at all for a first
 * visit -- an empty "Saved lakes" heading is worse than no heading.
 */
export default function SavedLakes() {
  const favorites = useSyncExternalStore(subscribe, favoritesSnapshot, emptySnapshot);
  const recent = useSyncExternalStore(subscribe, recentSnapshot, emptySnapshot);

  const favIds = new Set(favorites.map((l) => l.wbic));
  const recentOnly = recent.filter((l) => !favIds.has(l.wbic));
  if (favorites.length === 0 && recentOnly.length === 0) return null;

  return (
    <section className="pb-4">
      {favorites.length > 0 && (
        <>
          <h2 className="text-xs uppercase tracking-wide text-muted">Saved</h2>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {favorites.map((l) => (
              <LakeRow key={l.wbic} lake={l} />
            ))}
          </ul>
        </>
      )}

      {recentOnly.length > 0 && (
        <>
          <h2 className={`text-xs uppercase tracking-wide text-muted ${favorites.length ? "mt-5" : ""}`}>
            Recently viewed
          </h2>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {recentOnly.map((l) => (
              <LakeRow key={l.wbic} lake={l} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
