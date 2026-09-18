// Stroke geometry for the hand-inked layer. Pure math with no React Native or
// Skia imports, so every helper runs in Node tests and inside a Reanimated
// worklet. Ported from the design bundle's `shelvr-ink.js`.
//
// Two rules carry over from the reference and matter for how this reads:
// a stroke is revealed along its length (never by opacity), and the wobble is
// a deterministic function of the point index and a per-element seed, so an
// element looks hand-drawn but never jitters between frames.

export type Point = readonly [number, number];

/** Cubic in-out. The house easing for every ink reveal. */
export function ease(t: number): number {
  "worklet";
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** `t` remapped from the window `[a, b]` onto 0..1, clamped at both ends.
 * Every canvas derives its own progress from one shared clock this way. */
export function span(t: number, a: number, b: number): number {
  "worklet";
  if (b === a) return t >= b ? 1 : 0;
  return Math.max(0, Math.min(1, (t - a) / (b - a)));
}

/** Wobble amplitudes and frequencies, kept as named presets so a stroke type
 * always wobbles the same amount wherever it is drawn. */
export type WobblePreset = {
  /** Amplitude across and down, in points. */
  ax: number;
  ay: number;
  /** How fast the wobble cycles along the stroke. */
  fx: number;
  fy: number;
};

export const WOBBLE = {
  /** Long strokes: hairlines, shelves, threads. */
  line: { ax: 0.7, ay: 0.5, fx: 0.61, fy: 0.83 },
  /** Small drawn shapes: type marks, props, doodles. */
  mark: { ax: 0.45, ay: 0.45, fx: 2.1, fy: 1.7 },
  /** Props and doodles sit slightly looser than marks. */
  prop: { ax: 0.5, ay: 0.5, fx: 2.3, fy: 1.9 },
} as const satisfies Record<string, WobblePreset>;

/** Applies a deterministic pen wobble to a polyline. `seed` separates elements
 * that would otherwise wobble identically (two shelves on one screen). */
export function wobble(
  points: readonly Point[],
  preset: WobblePreset,
  seed = 0,
  scale = 1,
): Point[] {
  "worklet";
  const out: Point[] = [];
  for (let i = 0; i < points.length; i++) {
    const [x, y] = points[i];
    out.push([
      x + Math.sin(i * preset.fx + seed) * preset.ax * scale,
      y + Math.cos(i * preset.fy + seed) * preset.ay * scale,
    ]);
  }
  return out;
}

/** A cubic bezier sampled to `segments + 1` evenly-parameterised points.
 * Everything curved in the ink layer is built from these so that revealing a
 * stroke by length stays close to revealing it by point count. */
export function bezier(
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
  segments: number,
): Point[] {
  "worklet";
  const pts: Point[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const u = 1 - t;
    pts.push([
      u * u * u * p0[0] +
        3 * u * u * t * p1[0] +
        3 * u * t * t * p2[0] +
        t * t * t * p3[0],
      u * u * u * p0[1] +
        3 * u * u * t * p1[1] +
        3 * u * t * t * p2[1] +
        t * t * t * p3[1],
    ]);
  }
  return pts;
}

/** A quadratic bezier sampled the same way. The reference uses
 * `quadraticCurveTo` for prop and doodle curves. */
export function quad(
  p0: Point,
  c: Point,
  p1: Point,
  segments: number,
): Point[] {
  "worklet";
  const pts: Point[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const u = 1 - t;
    pts.push([
      u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0],
      u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1],
    ]);
  }
  return pts;
}

/** An arc sampled to points. `ry` defaults to `r`, so this also draws ellipses. */
export function arc(
  cx: number,
  cy: number,
  r: number,
  from: number,
  to: number,
  segments = 24,
  ry?: number,
): Point[] {
  "worklet";
  const pts: Point[] = [];
  const radiusY = ry ?? r;
  for (let i = 0; i <= segments; i++) {
    const a = from + (i / segments) * (to - from);
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * radiusY]);
  }
  return pts;
}

/** The shallow S-curve used for the hairline under every header. */
export function hairlinePoints(
  width: number,
  height: number,
  inset = 16,
): Point[] {
  "worklet";
  return bezier(
    [inset, height / 2],
    [width * 0.3, height * 0.2],
    [width * 0.65, height * 0.8],
    [width - inset, height / 2],
    100,
  );
}

/** A hand-drawn ellipse that overshoots by 8% and closes a little off, for the
 * circled word and the rings around an avatar or a step number. */
export function handEllipse(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  seed = 0,
  segments = 64,
): Point[] {
  "worklet";
  const pts: Point[] = [];
  const last = Math.floor(segments * 1.08);
  for (let k = 0; k <= last; k++) {
    const a = -Math.PI * 0.7 + (k / segments) * Math.PI * 2;
    const wob = 1 + Math.sin(k * 0.9 + seed) * 0.03;
    pts.push([
      cx + Math.cos(a) * rx * wob,
      // Past a full turn the pen drifts down instead of meeting its start.
      cy + Math.sin(a) * ry * wob + (k > segments ? (k - segments) * 0.4 : 0),
    ]);
  }
  return pts;
}

/** One sashiko stitch: 6 units on, 4 off. */
export type Stitch = { from: Point; to: Point };

/** Sashiko stitches along `y`, drawn left to right and revealed by `progress`.
 * Used as a divider, a seam, and the mark that closes a save. */
export function stitchSegments(
  x0: number,
  x1: number,
  y: number,
  progress: number,
  seed = 0,
): Stitch[] {
  "worklet";
  const upto = x0 + (x1 - x0) * Math.max(0, Math.min(1, progress));
  const out: Stitch[] = [];
  for (let x = x0, k = 0; x + 2 < upto; x += 10, k++) {
    const end = Math.min(x + 6, upto);
    const wy = y + Math.sin(k * 1.3 + seed) * 0.5;
    out.push({ from: [x, wy], to: [end, wy + Math.sin(k * 2.1) * 0.3] });
  }
  return out;
}

/** The running segment used for the thread and the inline spinner: a head that
 * leads and a tail that lifts off the paper behind it. Returns the slice of
 * `path` that is currently inked, or null when it is too short to draw. */
export function runnerSlice(
  path: readonly Point[],
  cycle: number,
): Point[] | null {
  "worklet";
  const head = ease(Math.min(1, cycle * 1.3));
  const tail = ease(Math.max(0, (cycle - 0.28) * 1.39));
  const m = path.length;
  const from = Math.max(0, Math.min(m - 3, Math.floor(tail * (m - 1))));
  const to = Math.min(m, Math.max(from + 2, Math.floor(head * (m - 1))));
  if (to - from < 2) return null;
  return path.slice(from, to) as Point[];
}
