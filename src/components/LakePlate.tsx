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
 * Scattered rather than gridded -- a grid reads as mechanical -- but packed by
 * rejection sampling instead of by hand, so nothing ever overlaps. Hand-placed
 * percentages were the original problem: they resolve against the hero box,
 * which is a different shape on a phone than on a desktop, so one set of
 * coordinates could not be right at both sizes.
 *
 * The container is square, which keeps the packing maths honest: a percentage
 * of width and a percentage of height mean the same thing, so a box test in
 * normalised space matches what actually gets drawn.
 *
 * Decorative: hidden from assistive tech, and baked in at build time so it
 * never blocks a render.
 */

interface Placed {
  x: number; // centre, 0-1
  y: number;
  size: number; // drawn size, fraction of the container
  /** Size once rotated -- what collision is actually tested against. */
  footprint: number;
  rotate: number;
  opacity: number;
}

/** Small deterministic PRNG so the layout is identical on server and client. */
function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Gap between outlines, as a fraction of the container. Small: they should
 *  sit close together, just never touch. */
const PADDING = 0.008;
const ATTEMPTS = 400;

/**
 * Place each outline at a random spot, rejecting any position that would
 * collide with something already down. Largest first, because big shapes are
 * the hardest to fit once the space is busy.
 */
function pack(count: number, seed = 20260909): Placed[] {
  const rand = mulberry32(seed);
  const sizes = Array.from({ length: count }, (_, i) => {
    // A spread of sizes, biggest first.
    const t = i / Math.max(1, count - 1);
    return 0.26 - t * 0.14 + rand() * 0.03;
  });

  const placed: Placed[] = [];
  for (const wanted of sizes) {
    // Rotation is chosen before placing, because rotating a box grows the area
    // it actually occupies -- by up to 41% at 45 degrees. Colliding against the
    // unrotated size looks fine in code and overlaps on screen.
    const rotate = Math.round((rand() - 0.5) * 44);
    const rad = (rotate * Math.PI) / 180;
    const spread = Math.abs(Math.cos(rad)) + Math.abs(Math.sin(rad));

    // Shrink and retry rather than give up: dropping a lake leaves a hole in
    // the scatter, and a slightly smaller outline reads no differently.
    let done = false;
    for (let shrink = 0; shrink < 6 && !done; shrink++) {
      const size = wanted * (1 - shrink * 0.09);
      const footprint = size * spread;
      const half = footprint / 2;

      for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
        const x = half + rand() * Math.max(0, 1 - footprint);
        const y = half + rand() * Math.max(0, 1 - footprint);
        const clash = placed.some((p) => {
          const minGap = (p.footprint + footprint) / 2 + PADDING;
          return Math.abs(p.x - x) < minGap && Math.abs(p.y - y) < minGap;
        });
        if (clash) continue;
        placed.push({
          x,
          y,
          size,
          footprint,
          rotate,
          // Larger outlines sit slightly forward, giving the scatter depth.
          opacity: 0.34 + (size - 0.11) * 2.2,
        });
        done = true;
        break;
      }
    }
  }
  return placed;
}

export default function LakePlate() {
  const shapes = (heroShapes as unknown as HeroShape[])
    .map((s) => ({ ...s, geom: shapeFromRings(s.rings) }))
    .filter((s) => s.geom);

  const layout = pack(shapes.length);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden
                 opacity-45 sm:opacity-100"
    >
      <div
        className="absolute right-0 top-1/2 -translate-y-1/2 aspect-square
                   w-[74%] sm:w-[56%]"
      >
        {layout.map((p, i) => {
          const s = shapes[i];
          if (!s) return null;
          return (
            <svg
              key={s.wbic}
              viewBox={s.geom!.viewBox}
              preserveAspectRatio="xMidYMid meet"
              className="absolute"
              style={{
                left: `${(p.x - p.size / 2) * 100}%`,
                top: `${(p.y - p.size / 2) * 100}%`,
                width: `${p.size * 100}%`,
                height: `${p.size * 100}%`,
                opacity: p.opacity,
                transform: `rotate(${p.rotate}deg)`,
              }}
            >
              <path
                d={s.geom!.path}
                fillRule="evenodd"
                fill="color-mix(in oklab, var(--water) 30%, transparent)"
                stroke="var(--accent)"
                strokeWidth={
                  Math.max(...s.geom!.viewBox.split(" ").slice(2).map(Number)) / 90
                }
                strokeOpacity="0.85"
                strokeLinejoin="round"
              />
            </svg>
          );
        })}
      </div>

      {/* Fade toward the text so nothing competes with reading, and soften the
          edges so the plate does not end in a visible seam. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(100deg, var(--background) 34%, color-mix(in oklab, var(--background) 64%, transparent) 56%, transparent 86%)",
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
