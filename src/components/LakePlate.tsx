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
 * The lake shapes are the most distinctive thing this project has and they
 * were only appearing partway down individual lake pages. Laid out like
 * specimens on a field-guide plate they carry the whole first screen -- and
 * nothing generic can imitate them, because they are the actual water.
 *
 * Decorative: hidden from assistive tech, and it never blocks the page since
 * the geometry is baked in at build time rather than fetched.
 */

/**
 * Hand-placed rather than random, so the composition reads as arranged.
 *
 * Sizes are deliberately modest: at 20rem-plus the outlines overlap into an
 * unreadable mass. Kept small and spaced, each one reads as its own lake,
 * which is the entire point of using real geometry.
 */
const LAYOUT: { top: string; left: string; size: string; rotate: number; opacity: number }[] = [
  { top: "6%",  left: "62%", size: "13rem",  rotate: -10, opacity: 0.55 },
  { top: "48%", left: "84%", size: "11rem",  rotate: 16,  opacity: 0.4 },
  { top: "58%", left: "62%", size: "8.5rem", rotate: -18, opacity: 0.32 },
  { top: "4%",  left: "86%", size: "8rem",   rotate: 24,  opacity: 0.34 },
  { top: "30%", left: "72%", size: "6.5rem", rotate: 6,   opacity: 0.3 },
  { top: "80%", left: "78%", size: "7rem",   rotate: -8,  opacity: 0.24 },
  { top: "26%", left: "94%", size: "6rem",   rotate: -24, opacity: 0.26 },
  { top: "72%", left: "92%", size: "5.5rem", rotate: 12,  opacity: 0.2 },
  { top: "88%", left: "66%", size: "5rem",   rotate: 28,  opacity: 0.18 },
  { top: "44%", left: "56%", size: "4.5rem", rotate: -4,  opacity: 0.16 },
];

export default function LakePlate() {
  const shapes = (heroShapes as unknown as HeroShape[])
    .map((s) => ({ ...s, geom: shapeFromRings(s.rings) }))
    .filter((s) => s.geom);

  return (
    <div
      aria-hidden="true"
      /* Dimmed on small screens: at phone width the plate sits directly behind
         the headline, and legibility beats decoration. */
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden
                 opacity-40 sm:opacity-100"
    >
      {shapes.map((s, i) => {
        const pos = LAYOUT[i % LAYOUT.length];
        return (
          <svg
            key={s.wbic}
            viewBox={s.geom!.viewBox}
            preserveAspectRatio="xMidYMid meet"
            className="absolute"
            style={{
              top: pos.top,
              left: pos.left,
              width: pos.size,
              height: pos.size,
              opacity: pos.opacity,
              transform: `rotate(${pos.rotate}deg)`,
            }}
          >
            <path
              d={s.geom!.path}
              fillRule="evenodd"
              fill="color-mix(in oklab, var(--water) 42%, transparent)"
              stroke="var(--accent)"
              strokeWidth={Math.max(...s.geom!.viewBox.split(" ").slice(2).map(Number)) / 180}
              strokeOpacity="0.75"
              strokeLinejoin="round"
            />
          </svg>
        );
      })}
      {/* Fade toward the text so nothing competes with reading, and soften the
          bottom edge so the plate does not end in a visible seam. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(100deg, var(--background) 30%, color-mix(in oklab, var(--background) 70%, transparent) 55%, transparent 82%)",
        }}
      />
      <div
        className="absolute inset-x-0 bottom-0 h-28"
        style={{
          background: "linear-gradient(to top, var(--background), transparent)",
        }}
      />
    </div>
  );
}
