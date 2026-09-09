import heroShapes from "@/data/hero-shapes.json";
import { shapeFromRings } from "@/lib/geometry";

type Ring = [number, number][];
interface HeroShape {
  wbic: number;
  name: string;
  rings: Ring[];
}

/**
 * A plate of real Wisconsin lake outlines, drawn from DNR survey geometry.
 *
 * Laid out on a grid rather than by hand-placed percentages. Percentages
 * resolve against the hero box, which is wide and short on a desktop and tall
 * and narrow on a phone -- so the same coordinates produced overlapping
 * clusters at one size and empty gaps at another. A grid gives every outline
 * its own cell, so the spacing holds at any width by construction.
 *
 * Decorative: hidden from assistive tech, and baked in at build time so it
 * never blocks a render.
 */

/**
 * Per-cell character, so the grid does not read as a grid. The nudges are
 * small offsets in percent -- enough to break the rows and columns without
 * reintroducing the overlap that hand-placing caused.
 */
const CELLS = [
  { rotate: -8,  scale: 1,    opacity: 0.85, dx: -6, dy: 4 },
  { rotate: 12,  scale: 0.78, opacity: 0.6,  dx: 8,  dy: -8 },
  { rotate: -16, scale: 0.9,  opacity: 0.75, dx: 2,  dy: 10 },
  { rotate: 6,   scale: 0.72, opacity: 0.55, dx: -10, dy: -4 },
  { rotate: 18,  scale: 0.95, opacity: 0.8,  dx: 5,  dy: 6 },
  { rotate: -4,  scale: 0.76, opacity: 0.58, dx: -3, dy: -9 },
  { rotate: 22,  scale: 0.85, opacity: 0.68, dx: 9,  dy: 3 },
  { rotate: -12, scale: 0.7,  opacity: 0.5,  dx: -7, dy: 8 },
  { rotate: 9,   scale: 0.88, opacity: 0.72, dx: 4,  dy: -6 },
];

export default function LakePlate() {
  const shapes = (heroShapes as unknown as HeroShape[])
    .map((s) => ({ ...s, geom: shapeFromRings(s.rings) }))
    .filter((s) => s.geom)
    .slice(0, CELLS.length);

  return (
    <div
      aria-hidden="true"
      /* Dimmed on a phone: the headline spans nearly the full width there, so
         the plate has to sit well behind it rather than beside it. */
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden
                 opacity-45 sm:opacity-100"
    >
      {/*
        Anchored right and sized in vw so it keeps its proportions: a phone
        gets a narrow two-column strip down the side, a desktop a wider three
        across. Nothing is ever placed under the headline.
      */}
      <div
        className="absolute inset-y-0 right-0 grid content-center
                   w-[46%] grid-cols-2 grid-rows-4 gap-2 p-2
                   sm:w-[54%] sm:grid-cols-3 sm:grid-rows-3 sm:gap-5 sm:p-5"
      >
        {shapes.map((s, i) => {
          const cell = CELLS[i];
          // The last cells only exist on the three-column layout.
          const hideOnMobile = i >= 8;
          return (
            <div
              key={s.wbic}
              className={`flex items-center justify-center ${
                hideOnMobile ? "hidden sm:flex" : ""
              }`}
            >
              <svg
                viewBox={s.geom!.viewBox}
                preserveAspectRatio="xMidYMid meet"
                /* Capped so a long narrow lake cannot stretch to fill its cell
                   and dominate the whole plate. */
                className="max-h-24 max-w-24 sm:max-h-32 sm:max-w-32"
                style={{
                  opacity: cell.opacity,
                  transform: `translate(${cell.dx}%, ${cell.dy}%) rotate(${cell.rotate}deg) scale(${cell.scale})`,
                }}
              >
                <path
                  d={s.geom!.path}
                  fillRule="evenodd"
                  fill="color-mix(in oklab, var(--water) 30%, transparent)"
                  stroke="var(--accent)"
                  /* Thick enough that the shoreline still reads once the
                     outline is only a hundred pixels across. */
                  strokeWidth={
                    Math.max(...s.geom!.viewBox.split(" ").slice(2).map(Number)) / 90
                  }
                  strokeOpacity="0.85"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          );
        })}
      </div>

      {/* Fade toward the text so nothing competes with reading, and soften the
          edges so the plate does not end in a visible seam. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(100deg, var(--background) 40%, color-mix(in oklab, var(--background) 68%, transparent) 62%, transparent 88%)",
        }}
      />
      <div
        className="absolute inset-x-0 bottom-0 h-24"
        style={{ background: "linear-gradient(to top, var(--background), transparent)" }}
      />
      <div
        className="absolute inset-x-0 top-0 h-12"
        style={{ background: "linear-gradient(to bottom, var(--background), transparent)" }}
      />
    </div>
  );
}
