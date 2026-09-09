/**
 * Per-browser memory: which lakes you starred, and which you looked at recently.
 *
 * This is deliberately localStorage rather than a database. It is a personal
 * convenience, it needs no account, and it costs nothing to run. When catch
 * logging arrives that genuinely needs a server; this does not.
 *
 * Every access is wrapped: localStorage throws outright in some contexts
 * (private windows, blocked site data) rather than merely returning null.
 */

export interface SavedLake {
  wbic: number;
  name: string;
  county: string | null;
  acres: number;
  /** Epoch ms of the most recent visit. Unused for favourites. */
  at?: number;
}

const FAVORITES_KEY = "honeyhole:favorites";
const RECENT_KEY = "honeyhole:recent";
const MAX_RECENT = 6;

type Store = Pick<Storage, "getItem" | "setItem">;

function store(): Store | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function read(key: string, s: Store | null = store()): SavedLake[] {
  if (!s) return [];
  try {
    const raw = s.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Anything could be in storage -- another tab, an older version, a user
    // editing it by hand. Keep only entries that still look like lakes.
    // Validate every field the UI actually renders. Checking only wbic and
    // name let an older or hand-edited entry through without `acres`, and
    // LakeRow's acres.toLocaleString() would then take down the whole page.
    return parsed.filter(
      (x): x is SavedLake =>
        x &&
        typeof x.wbic === "number" &&
        typeof x.name === "string" &&
        typeof x.acres === "number" &&
        (x.county === null || typeof x.county === "string"),
    );
  } catch {
    return [];
  }
}

function write(key: string, lakes: SavedLake[], s: Store | null = store()): void {
  if (!s) return;
  try {
    s.setItem(key, JSON.stringify(lakes));
  } catch {
    // Quota exceeded or storage blocked. A lost favourite is not worth throwing.
  }
}

export const getFavorites = (s?: Store | null) => read(FAVORITES_KEY, s ?? store());
export const getRecent = (s?: Store | null) => read(RECENT_KEY, s ?? store());

export function isFavorite(wbic: number, s?: Store | null): boolean {
  return getFavorites(s).some((l) => l.wbic === wbic);
}

/** Toggle and return the new state. */
export function toggleFavorite(lake: SavedLake, s: Store | null = store()): boolean {
  const current = read(FAVORITES_KEY, s);
  const existing = current.findIndex((l) => l.wbic === lake.wbic);
  if (existing >= 0) {
    current.splice(existing, 1);
    write(FAVORITES_KEY, current, s);
    invalidate();
    return false;
  }
  write(FAVORITES_KEY, [{ ...lake, at: Date.now() }, ...current], s);
  invalidate();
  return true;
}

/** Record a visit, most recent first, without duplicates. */
export function recordVisit(lake: SavedLake, s: Store | null = store()): SavedLake[] {
  const current = read(RECENT_KEY, s).filter((l) => l.wbic !== lake.wbic);
  const next = [{ ...lake, at: Date.now() }, ...current].slice(0, MAX_RECENT);
  write(RECENT_KEY, next, s);
  invalidate();
  return next;
}

export const KEYS = { FAVORITES_KEY, RECENT_KEY, MAX_RECENT };

/* --------------------------------------------------------------------------
 * External-store plumbing for useSyncExternalStore.
 *
 * localStorage is state React does not own, and reading it during render would
 * mismatch the server HTML. useSyncExternalStore is the sanctioned way to
 * subscribe to it -- but it demands a *stable* snapshot reference, so parsed
 * values are cached and the cache is invalidated on write. Returning a freshly
 * parsed array each call would re-render forever.
 * -------------------------------------------------------------------------- */

const EMPTY: SavedLake[] = [];
const listeners = new Set<() => void>();
let favCache: SavedLake[] | null = null;
let recentCache: SavedLake[] | null = null;

function invalidate(): void {
  favCache = null;
  recentCache = null;
  for (const fn of listeners) fn();
}

export function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  // Another tab changing storage should update this one too.
  const onStorage = (e: StorageEvent) => {
    if (e.key === FAVORITES_KEY || e.key === RECENT_KEY || e.key === null) invalidate();
  };
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
  };
}

export function favoritesSnapshot(): SavedLake[] {
  if (favCache === null) favCache = read(FAVORITES_KEY);
  return favCache;
}

export function recentSnapshot(): SavedLake[] {
  if (recentCache === null) recentCache = read(RECENT_KEY);
  return recentCache;
}

/** The server has no storage, so it always renders the empty state. */
export const emptySnapshot = (): SavedLake[] => EMPTY;
