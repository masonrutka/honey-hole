import { fetchLakeShape } from "@/lib/geometry";
import type { Lake } from "@/lib/lakes";

/**
 * The lake's actual outline, drawn from DNR hydrography.
 *
 * Shape is genuinely useful information: a round bowl and a maze of bays with
 * ten miles of weed edge fish completely differently, and no amount of acreage
 * tells you which one you are looking at.
 */
export default async function LakeMap({ lake }: { lake: Lake }) {
  const shape = await fetchLakeShape(lake.wbic, lake.acres);

  const links = (
    <div className="mt-3 flex flex-wrap gap-2 text-sm">
      {lake.contourMapUrl && (
        <a
          href={lake.contourMapUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="rounded-lg border border-edge bg-surface px-3 py-1.5 text-xs
                     hover:border-accent hover:text-accent transition-colors"
        >
          Depth contour map ↗
        </a>
      )}
      {lake.dnrMapUrl && (
        <a
          href={lake.dnrMapUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="rounded-lg border border-edge bg-surface px-3 py-1.5 text-xs
                     hover:border-accent hover:text-accent transition-colors"
        >
          DNR interactive map ↗
        </a>
      )}
      <a
        href={`https://www.google.com/maps/search/?api=1&query=${lake.lat},${lake.lon}`}
        target="_blank"
        rel="noreferrer noopener"
        className="rounded-lg border border-edge bg-surface px-3 py-1.5 text-xs
                   hover:border-accent hover:text-accent transition-colors"
      >
        Open in Maps ↗
      </a>
    </div>
  );

  if (!shape) {
    return (
      <section className="mt-8">
        <h2 className="text-sm font-semibold">Maps</h2>
        {links}
      </section>
    );
  }

  const [, , vw, vh] = shape.viewBox.split(" ").map(Number);
  // A round number of miles that fits comfortably under the shape.
  const target = shape.widthMiles / 3;
  const nice = [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 50].reduce((a, b) =>
    Math.abs(b - target) < Math.abs(a - target) ? b : a,
  );
  const barFraction = Math.min(0.85, nice / shape.widthMiles);

  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold">{lake.name}</h2>
      <p className="mt-1 text-xs text-muted">
        Shoreline from DNR hydrography · north is up
      </p>

      <figure className="mt-2 rounded-xl border border-edge bg-surface p-4">
        {/*
          Sized by aspect ratio rather than stretched to the container: a long
          narrow lake letterboxed inside a full-width box wastes most of the
          space. The wrapper shrinks to the drawn width so the scale bar below
          measures the lake and not the card.
        */}
        <div className="mx-auto" style={{ width: "fit-content", maxWidth: "100%" }}>
        <svg
          viewBox={shape.viewBox}
          style={{
            display: "block",
            height: `min(58vh, 440px)`,
            width: "auto",
            maxWidth: "100%",
          }}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={`Outline of ${lake.name}, ${lake.acres.toLocaleString()} acres`}
        >
          <defs>
            <linearGradient id={`water-${lake.wbic}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1e4a6b" />
              <stop offset="100%" stopColor="#123047" />
            </linearGradient>
          </defs>
          <path
            d={shape.path}
            // evenodd cuts islands out of the water rather than filling them.
            fillRule="evenodd"
            fill={`url(#water-${lake.wbic})`}
            stroke="#38bdf8"
            strokeWidth={Math.max(vw, vh) / 400}
            strokeLinejoin="round"
          />
        </svg>

        <figcaption className="mt-3 flex items-center gap-2 text-[11px] text-muted">
            <span
              className="inline-block border-x border-b border-muted/60 h-1.5"
              style={{ width: `${(barFraction * 100).toFixed(1)}%` }}
              aria-hidden="true"
            />
            <span className="whitespace-nowrap">{nice} mi</span>
          </figcaption>
        </div>

        <p className="mt-2 text-[11px] text-muted text-right">
          {lake.acres.toLocaleString()} acres
          {lake.maxDepthFt ? ` · ${lake.maxDepthFt} ft max depth` : ""}
        </p>
      </figure>

      {links}
    </section>
  );
}

/** Placeholder while the outline is fetched. */
export function LakeMapSkeleton() {
  return (
    <section className="mt-8 animate-pulse">
      <div className="h-3.5 w-32 rounded bg-surface-2" />
      <div className="mt-2 h-64 rounded-xl bg-surface-2" />
    </section>
  );
}
