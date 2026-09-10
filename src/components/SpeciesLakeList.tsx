"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { geolocationBlocker, geolocationMessage } from "@/lib/geolocation";

export interface SpeciesLake {
  wbic: number;
  name: string;
  county: string | null;
  acres: number;
  abundance: "Abundant" | "Common" | "Present" | null;
}

interface BiteResult {
  wbic: number;
  name: string;
  county: string | null;
  acres: number;
  score: number;
  rating: string;
  summary: string;
  distanceMi: number;
  waterTempF: number;
  abundance: "Abundant" | "Common" | "Present" | null;
  /** Position in the server's ranking, which already breaks ties on population. */
  rank: number;
}

type SortMode = "abundance" | "size" | "name" | "bite";

const ABUNDANCE_TONE: Record<string, string> = {
  Abundant: "text-prime",
  Common: "text-good",
  Present: "text-muted",
};

const RATING_TONE: Record<string, string> = {
  Prime: "text-prime",
  Good: "text-good",
  Fair: "text-fair",
  Slow: "text-slow",
  Poor: "text-poor",
};

const ABUNDANCE_RANK = { Abundant: 0, Common: 1, Present: 2 } as const;

export default function SpeciesLakeList({
  speciesKey,
  speciesName,
  lakes,
  totalCount,
}: {
  speciesKey: string;
  speciesName: string;
  lakes: SpeciesLake[];
  totalCount: number;
}) {
  const [query, setQuery] = useState("");
  const [county, setCounty] = useState("");
  const [sort, setSort] = useState<SortMode>("abundance");
  const [searchHits, setSearchHits] = useState<SpeciesLake[] | null>(null);
  const [bite, setBite] = useState<Map<number, BiteResult> | null>(null);
  const [spread, setSpread] = useState(0);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const counties = useMemo(
    () =>
      [...new Set(lakes.map((l) => l.county).filter(Boolean))].sort() as string[],
    [lakes],
  );

  // Searching hits the API rather than filtering in memory: the page only ships
  // the largest few hundred lakes, but a search should reach all of them.
  const latest = useRef(0);
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const id = ++latest.current;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(q)}&species=${speciesKey}`,
        );
        const data = await res.json();
        if (id !== latest.current) return;
        setSearchHits(data.results);
      } catch {
        if (id === latest.current) setError("Search failed.");
      }
    }, 180);
    return () => clearTimeout(timer);
  }, [query, speciesKey]);

  function rankByBite() {
    const blocked = geolocationBlocker();
    if (blocked) {
      setError(blocked);
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const res = await fetch(
            `/api/species/${speciesKey}/bite?lat=${latitude}&lon=${longitude}`,
          );
          if (!res.ok) throw new Error("failed");
          const data = await res.json();
          setBite(
            new Map(
              data.results.map((r: BiteResult, i: number) => [
                r.wbic,
                { ...r, rank: i },
              ]),
            ),
          );
          setSpread(data.spread ?? 0);
          setSort("bite");
        } catch {
          setError("Could not rank by bite right now.");
        } finally {
          setLocating(false);
        }
      },
      (err) => {
        setError(geolocationMessage(err));
        setLocating(false);
      },
      { timeout: 10000, maximumAge: 60000 },
    );
  }

  const visible = useMemo(() => {
    const base = query.trim().length >= 2 && searchHits ? searchHits : lakes;
    const out = county ? base.filter((l) => l.county === county) : base;

    if (sort === "bite" && bite) {
      // Render straight from the scored set in the server's order. Intersecting
      // with the shipped list would drop most results, since those are the
      // largest lakes statewide rather than the ones near you.
      const scored = [...bite.values()]
        .sort((a, b) => a.rank - b.rank)
        .map((r) => ({
          wbic: r.wbic,
          name: r.name,
          county: r.county,
          acres: r.acres,
          abundance: r.abundance,
        }));
      return county ? scored.filter((l) => l.county === county) : scored;
    }
    return [...out].sort((a, b) => {
      if (sort === "size") return b.acres - a.acres;
      if (sort === "name") return a.name.localeCompare(b.name);
      const ra = ABUNDANCE_RANK[a.abundance ?? "Present"];
      const rb = ABUNDANCE_RANK[b.abundance ?? "Present"];
      return ra - rb || b.acres - a.acres;
    });
  }, [lakes, searchHits, query, county, sort, bite]);

  const showingAll = query.trim().length >= 2 || lakes.length >= totalCount;

  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => {
            const next = e.target.value;
            setQuery(next);
            if (next.trim().length < 2) {
              latest.current++;
              setSearchHits(null);
            }
          }}
          placeholder={`Search lakes with ${speciesName.toLowerCase()}…`}
          aria-label={`Search lakes containing ${speciesName}`}
          className="flex-1 rounded-lg border border-edge bg-surface px-3 py-2.5 text-sm
                     placeholder:text-muted/70 focus:border-accent focus:outline-none"
        />
        <select
          value={county}
          onChange={(e) => setCounty(e.target.value)}
          aria-label="Filter by county"
          className="rounded-lg border border-edge bg-surface px-3 py-2.5 text-sm
                     focus:border-accent focus:outline-none"
        >
          <option value="">All counties</option>
          {counties.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {(
          [
            ["abundance", "Best population"],
            ["size", "Largest"],
            ["name", "A–Z"],
          ] as const
        ).map(([mode, label]) => (
          <button
            key={mode}
            onClick={() => setSort(mode)}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              sort === mode
                ? "border-accent bg-accent/15 text-accent"
                : "border-edge text-muted hover:border-accent/60 hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
        <button
          onClick={rankByBite}
          disabled={locating}
          className={`rounded-full border px-3 py-1 text-xs transition-colors disabled:opacity-60 ${
            sort === "bite" && bite
              ? "border-accent bg-accent/15 text-accent"
              : "border-edge text-muted hover:border-accent/60 hover:text-foreground"
          }`}
        >
          {locating ? "Checking conditions…" : "🎣 Best bite near me"}
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-slow">{error}</p>}

      {sort === "bite" && bite && (
        <p className="mt-3 text-xs text-muted text-pretty">
          The {bite.size} closest lakes with {speciesName.toLowerCase()}, scored on
          current conditions.{" "}
          {spread <= 8
            ? "Conditions are nearly identical across all of them today, so these are ranked by how strong the population is — same weather, more fish."
            : "Where scores tie, the stronger population ranks higher."}
        </p>
      )}

      {!showingAll && sort !== "bite" && (
        <p className="mt-3 text-xs text-muted">
          Showing the {lakes.length.toLocaleString()} largest of{" "}
          {totalCount.toLocaleString()} lakes. Search to reach the rest.
        </p>
      )}

      {visible.length === 0 ? (
        <p className="mt-6 text-sm text-muted">
          No lakes match those filters.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-edge/70 rounded-lg border border-edge overflow-hidden">
          {visible.map((lake) => {
            const b = bite?.get(lake.wbic);
            return (
              <li key={lake.wbic}>
                <Link
                  href={`/lake/${lake.wbic}?species=${speciesKey}`}
                  className="block px-4 py-3 bg-surface hover:bg-surface-2 transition-colors"
                >
                  <div className="flex items-baseline gap-3">
                    {b && (
                      <span
                        className={`shrink-0 text-sm font-semibold tabular-nums w-7 ${
                          RATING_TONE[b.rating] ?? ""
                        }`}
                      >
                        {b.score}
                      </span>
                    )}
                    <span className="font-medium">{lake.name}</span>
                    <span className="text-xs text-muted">
                      {lake.county ? `${lake.county} County` : "Wisconsin"}
                    </span>
                    <span className="ml-auto flex items-baseline gap-3 whitespace-nowrap">
                      {b && (
                        <span className="text-xs text-accent">{b.distanceMi} mi</span>
                      )}
                      {lake.abundance && (
                        <span
                          className={`text-[11px] uppercase tracking-wide ${
                            ABUNDANCE_TONE[lake.abundance] ?? "text-muted"
                          }`}
                        >
                          {lake.abundance}
                        </span>
                      )}
                      <span className="text-xs text-muted w-20 text-right">
                        {lake.acres.toLocaleString()} ac
                      </span>
                    </span>
                  </div>
                  {b && (
                    <p className="mt-1 text-xs text-muted first-letter:uppercase">
                      {b.summary}
                    </p>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
