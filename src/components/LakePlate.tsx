import heroShapes from "@/data/hero-shapes.json";
import { mapFromLakes, type Ring } from "@/lib/geometry";

interface HeroShape {
  wbic: number;
  name: string;
  rings: Ring[];
}

/**
 * A real map excerpt: the Lac du Flambeau chain west of Minocqua -- Fence,
 * Crawling Stone, White Sand, Flambeau and Pokegama -- about 13 miles across.
 *
 * Every outline sits where it actually sits, at its true relative size,
 * because all 30 are projected through one shared bounding box. Earlier
 * versions scattered them -- by hand, then on a grid, then by packing -- and
 * each needed its own machinery to avoid collisions. Real lakes do not
 * overlap, so geography does that work for free, and the result reads as a
 * place rather than as an arrangement.
 *
 * The window is deliberately tight. A wider view holds more lakes but renders
 * them as specks; at this scale each one carries its actual shoreline.
 *
 * Decorative: hidden from assistive tech, and baked in at build time so it
 * never blocks a render.
 */
export default function LakePlate() {
  const view = mapFromLakes(heroShapes as unknown as HeroShape[]);
  if (!view) return null;

  const [, , vw, vh] = view.viewBox.split(" ").map(Number);
  const span = Math.max(vw, vh);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden
                 opacity-50 sm:opacity-100"
    >
      <svg
        viewBox={view.viewBox}
        preserveAspectRatio="xMidYMid slice"
        /* Zoomed past the frame and cropped, so the map runs off the edges the
           way a chart excerpt does rather than sitting as a contained picture. */
        className="absolute right-0 top-1/2 -translate-y-1/2
                   h-[150%] w-[92%] sm:h-[135%] sm:w-[66%]"
      >
        {view.lakes.map((lake) => (
          <path
            key={lake.wbic}
            d={lake.path}
            fillRule="evenodd"
            fill="color-mix(in oklab, var(--water) 34%, transparent)"
            stroke="var(--accent)"
            /* One stroke weight across the map, as a survey sheet would have,
               rather than scaling per lake. */
            strokeWidth={span / 520}
            strokeOpacity="0.8"
            strokeLinejoin="round"
          />
        ))}
      </svg>

      {/* Fade toward the text so nothing competes with reading, and soften the
          edges so the map does not end in a visible seam. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(100deg, var(--background) 32%, color-mix(in oklab, var(--background) 62%, transparent) 55%, transparent 86%)",
        }}
      />
      <div
        className="absolute inset-x-0 bottom-0 h-24"
        style={{ background: "linear-gradient(to top, var(--background), transparent)" }}
      />
      <div
        className="absolute inset-x-0 top-0 h-14"
        style={{ background: "linear-gradient(to bottom, var(--background), transparent)" }}
      />
    </div>
  );
}
