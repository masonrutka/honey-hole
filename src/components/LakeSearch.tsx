"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

interface Result {
  wbic: number;
  name: string;
  county: string | null;
  acres: number;
  maxDepthFt: number | null;
  speciesCount: number;
  distanceMi?: number;
}

export default function LakeSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [mode, setMode] = useState<"search" | "nearby">("search");
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  // Debounce so typing "winnebago" fires one request, not nine.
  const latest = useRef(0);
  useEffect(() => {
    if (query.trim().length < 2) {
      if (mode === "search") setResults([]);
      return;
    }
    setLoading(true);
    const id = ++latest.current;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        if (id !== latest.current) return; // a newer keystroke already won
        setResults(data.results);
        setMode("search");
        setError(null);
      } catch {
        if (id === latest.current) setError("Search failed. Check your connection.");
      } finally {
        if (id === latest.current) setLoading(false);
      }
    }, 180);
    return () => clearTimeout(timer);
  }, [query, mode]);

  function findNearby() {
    if (!navigator.geolocation) {
      setError("This browser cannot share your location.");
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const res = await fetch(`/api/search?lat=${latitude}&lon=${longitude}`);
          const data = await res.json();
          latest.current++; // cancel any in-flight text search
          setResults(data.results);
          setMode("nearby");
          setQuery("");
          setTouched(true);
        } catch {
          setError("Could not load nearby lakes.");
        } finally {
          setLocating(false);
        }
      },
      () => {
        setError("Location permission denied.");
        setLocating(false);
      },
      { timeout: 10000 },
    );
  }

  const showEmpty =
    touched && !loading && results.length === 0 && query.trim().length >= 2;

  return (
    <div className="w-full">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <svg
            viewBox="0 0 24 24"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted"
            aria-hidden="true"
          >
            <path
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              d="M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16Zm10 2-4.5-4.5"
            />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setTouched(true);
              if (mode === "nearby") setMode("search");
            }}
            placeholder="Search 5,000 Wisconsin lakes…"
            aria-label="Search Wisconsin lakes by name or county"
            className="w-full rounded-lg border border-edge bg-surface pl-9 pr-3 py-3 text-base
                       placeholder:text-muted/70 focus:border-accent focus:outline-none"
          />
        </div>
        <button
          onClick={findNearby}
          disabled={locating}
          className="rounded-lg border border-edge bg-surface-2 px-4 py-3 text-sm font-medium
                     hover:border-accent hover:text-accent transition-colors disabled:opacity-60
                     disabled:cursor-not-allowed whitespace-nowrap"
        >
          {locating ? "Locating…" : "Near me"}
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-slow">{error}</p>}

      {mode === "nearby" && results.length > 0 && (
        <p className="mt-4 text-xs uppercase tracking-wide text-muted">
          Closest water to you
        </p>
      )}

      {showEmpty && (
        <p className="mt-6 text-sm text-muted">
          No lakes match “{query}”. Try a shorter name, or search by county.
        </p>
      )}

      {results.length > 0 && (
        <ul className="mt-3 divide-y divide-edge/70 rounded-lg border border-edge overflow-hidden">
          {results.map((lake) => (
            <li key={lake.wbic}>
              <Link
                href={`/lake/${lake.wbic}`}
                className="flex items-baseline gap-3 px-4 py-3 bg-surface hover:bg-surface-2 transition-colors"
              >
                <span className="font-medium">{lake.name}</span>
                <span className="text-xs text-muted">
                  {lake.county ? `${lake.county} County` : "Wisconsin"}
                </span>
                <span className="ml-auto text-xs text-muted whitespace-nowrap">
                  {lake.distanceMi !== undefined && (
                    <span className="text-accent">{lake.distanceMi} mi · </span>
                  )}
                  {lake.acres.toLocaleString()} ac
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
