// Deterministic layout for the launch animation ("thread" composition).
//
// A thread draws down the screen, hand-sketched saves — notes, recipes,
// articles, photos, products — fade in scattered along it, then glide onto a
// shelf row at the centre where each one settles into a stitch.
//
// Everything here is pure geometry in a fixed 390x844 design space, generated
// from one seeded RNG so the scatter is identical on every launch and on every
// device (the renderer scales the whole composition to the real screen). No
// Skia or React imports: the shapes are described as primitives and turned into
// paths once, at mount, by `components/splash/thread-canvas.tsx`.

/**
 * Width of the 390x844 design space the composition is authored against. The
 * renderer scales by this alone and centres on the anchor, so a taller or
 * wider screen simply shows more of the flat ground.
 */
export const DESIGN_WIDTH = 390;

/** Composition centre — the lockup sits on this point too. */
export const CENTER_X = 195;
export const CENTER_Y = 388;

/** The shelf row the marks collect onto, and its span. */
export const SHELF_Y = CENTER_Y + 48;
export const SHELF_WIDTH = 240;

export const MARK_COUNT = 30;
export const DUST_COUNT = 56;

/** Peak of the arc a mark travels through on its way to the shelf. */
export const TRAVEL_LIFT = 26;
/** Half-length of the stitch a mark becomes once it lands. */
export const STITCH_HALF_WIDTH = 3.4;

export type SaveType = "note" | "recipe" | "article" | "photo" | "product";

const SAVE_TYPES: SaveType[] = [
  "note",
  "recipe",
  "article",
  "photo",
  "product",
];

/**
 * Which palette entry a mark is drawn in. Resolved to hex by the renderer so
 * the composition stays independent of the ground it is drawn on.
 */
export type InkTone = "ink" | "accent" | "cool";

export type Mark = {
  /** Scatter position in design space. */
  x: number;
  y: number;
  type: SaveType;
  /** Half-extent of the glyph before the travel shrink. */
  size: number;
  /** Resting tilt, unwound to 0 as the mark reaches the shelf. */
  rotation: number;
  tone: InkTone;
  /** Seconds: fade-in start, travel start, travel duration. */
  appearAt: number;
  travelAt: number;
  travelDuration: number;
  /** Pen-wobble seed, so no two glyphs are drawn quite alike. */
  wobble: number;
  /** Position in the shelf row, shuffled so travel paths cross. */
  slot: number;
};

export type Dust = {
  x: number;
  y: number;
  appearAt: number;
  radius: number;
};

export type Point = readonly [number, number];

/**
 * One stroke of a glyph. `polyline` covers straight runs, `arc` the bowls and
 * handles, and `quad` the steam curling off a recipe.
 */
export type Stroke =
  | { kind: "polyline"; points: Point[]; close: boolean; heavy?: boolean }
  | { kind: "squiggle"; points: Point[] }
  | { kind: "arc"; cx: number; cy: number; r: number; from: number; to: number }
  | { kind: "circle"; cx: number; cy: number; r: number }
  | { kind: "quad"; from: Point; control: Point; to: Point };

export type Composition = {
  /** The thread, in two segments: above the centre, then below it. */
  threadAbove: Point[];
  threadBelow: Point[];
  marks: Mark[];
  dust: Dust[];
};

/**
 * Lehmer / Park-Miller generator. Small, fast, and — unlike `Math.random` —
 * reproducible, which is what keeps the scatter stable across launches.
 */
function createRandom(seed = 7): () => number {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

function cubicAt(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const u = 1 - t;
  return [
    u * u * u * p0[0] +
      3 * u * u * t * p1[0] +
      3 * u * t * t * p2[0] +
      t ** 3 * p3[0],
    u * u * u * p0[1] +
      3 * u * u * t * p1[1] +
      3 * u * t * t * p2[1] +
      t ** 3 * p3[1],
  ];
}

/**
 * Samples a cubic into a polyline, nudging x by two out-of-phase sines so the
 * thread reads as drawn by hand rather than plotted.
 */
function sampleThread(
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
  steps: number,
): Point[] {
  const points: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    const [x, y] = cubicAt(p0, p1, p2, p3, i / steps);
    points.push([
      x + 0.9 * Math.sin(i * 0.61 + 1) + 0.5 * Math.sin(i * 1.73),
      y,
    ]);
  }
  return points;
}

/** Horizontal position of the thread at a given height — the scatter's spine. */
function threadXAt(above: Point[], below: Point[], y: number): number {
  const points = y < CENTER_Y ? above : below;
  let nearest = points[0];
  for (const point of points) {
    if (Math.abs(point[1] - y) < Math.abs(nearest[1] - y)) nearest = point;
  }
  return nearest[0];
}

/**
 * Builds the whole composition. The RNG is consumed in a fixed order, so
 * changing or reordering any draw below reshuffles the entire scatter.
 */
export function buildComposition(seed = 7): Composition {
  const random = createRandom(seed);

  const threadAbove = sampleThread(
    [262, -12],
    [120, 150],
    [250, 300],
    [CENTER_X, CENTER_Y],
    260,
  );
  const threadBelow = sampleThread(
    [CENTER_X, CENTER_Y],
    [150, 520],
    [240, 700],
    [176, 860],
    240,
  );

  const marks: Mark[] = [];
  for (let i = 0; i < MARK_COUNT; i++) {
    const y = 70 + random() * 690;
    // Three summed draws approximate a normal spread, so marks cluster near
    // the thread and thin out towards the edges.
    const spread = (random() + random() + random() - 1.5) * 110;
    const x = Math.max(
      18,
      Math.min(
        DESIGN_WIDTH - 18,
        threadXAt(threadAbove, threadBelow, y) + spread,
      ),
    );
    const toneRoll = random();
    marks.push({
      x,
      y,
      type: SAVE_TYPES[Math.floor(random() * SAVE_TYPES.length)],
      size: 6 + random() * 4.5,
      rotation: (random() - 0.5) * 0.7,
      tone: toneRoll < 0.78 ? "ink" : toneRoll < 0.91 ? "accent" : "cool",
      appearAt: 0.3 + random() * 1.15,
      travelAt: 1.5 + random() * 0.55,
      travelDuration: 0.75 + random() * 0.25,
      wobble: random() * 10,
      slot: i,
    });
  }

  // Shuffle the shelf slots so marks cross on the way in instead of filing
  // into the row in the order they appeared.
  for (let i = MARK_COUNT - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const slot = marks[i].slot;
    marks[i].slot = marks[j].slot;
    marks[j].slot = slot;
  }

  const dust: Dust[] = [];
  for (let i = 0; i < DUST_COUNT; i++) {
    const y = 40 + random() * 780;
    dust.push({
      x: threadXAt(threadAbove, threadBelow, y) + (random() - 0.5) * 120,
      y,
      appearAt: 0.2 + random() * 1.3,
      radius: 0.6 + random() * 0.6,
    });
  }

  return { threadAbove, threadBelow, marks, dust };
}

/** Where a mark comes to rest in the shelf row. */
export function shelfSlotX(slot: number): number {
  return CENTER_X - SHELF_WIDTH / 2 + (slot / (MARK_COUNT - 1)) * SHELF_WIDTH;
}

/**
 * The strokes of one sketched save, centred on the origin and sized by
 * `mark.size`. The pen wobble is applied by the renderer, which needs the
 * point's index along the stroke.
 */
export function glyphStrokes(mark: Mark): Stroke[] {
  const s = mark.size;

  switch (mark.type) {
    // A page with a folded corner and two scribbled lines.
    case "note":
      return [
        {
          kind: "polyline",
          close: true,
          points: [
            [-s * 0.8, -s],
            [s * 0.35, -s],
            [s * 0.8, -s * 0.55],
            [s * 0.8, s],
            [-s * 0.8, s],
          ],
        },
        {
          kind: "polyline",
          close: false,
          points: [
            [s * 0.35, -s],
            [s * 0.35, -s * 0.55],
            [s * 0.8, -s * 0.55],
          ],
        },
        {
          kind: "squiggle",
          points: squiggle(
            -s * 0.5,
            s * 0.45,
            -s * 0.15,
            6,
            s * 0.09,
            mark.wobble,
          ),
        },
        {
          kind: "squiggle",
          points: squiggle(
            -s * 0.5,
            s * 0.2,
            s * 0.4,
            5,
            s * 0.09,
            mark.wobble,
          ),
        },
      ];

    // A bowl on a stand, with two curls of steam.
    case "recipe":
      return [
        {
          kind: "arc",
          cx: 0,
          cy: -s * 0.05,
          r: s * 0.95,
          from: 0.05,
          to: Math.PI - 0.05,
        },
        {
          kind: "polyline",
          close: false,
          points: [
            [-s, -s * 0.05],
            [s, -s * 0.05],
          ],
        },
        {
          kind: "polyline",
          close: false,
          points: [
            [-s * 0.35, s * 0.9],
            [s * 0.35, s * 0.9],
          ],
        },
        {
          kind: "quad",
          from: [-s * 0.35, -s * 0.35],
          control: [-s * 0.55, -s * 0.7],
          to: [-s * 0.3, -s * 1.05],
        },
        {
          kind: "quad",
          from: [s * 0.2, -s * 0.35],
          control: [0, -s * 0.7],
          to: [s * 0.25, -s * 1.05],
        },
      ];

    // A framed page: heavy heading bar, then three lines of body text.
    case "article":
      return [
        {
          kind: "polyline",
          close: true,
          points: [
            [-s * 0.8, -s],
            [s * 0.8, -s],
            [s * 0.8, s],
            [-s * 0.8, s],
          ],
        },
        {
          kind: "polyline",
          close: false,
          heavy: true,
          points: [
            [-s * 0.5, -s * 0.6],
            [s * 0.2, -s * 0.6],
          ],
        },
        {
          kind: "polyline",
          close: false,
          points: [
            [-s * 0.5, -s * 0.15],
            [s * 0.5, -s * 0.15],
          ],
        },
        {
          kind: "polyline",
          close: false,
          points: [
            [-s * 0.5, s * 0.2],
            [s * 0.5, s * 0.2],
          ],
        },
        {
          kind: "polyline",
          close: false,
          points: [
            [-s * 0.5, s * 0.55],
            [s * 0.1, s * 0.55],
          ],
        },
      ];

    // A frame holding a ridge line and a sun.
    case "photo":
      return [
        {
          kind: "polyline",
          close: true,
          points: [
            [-s, -s * 0.8],
            [s, -s * 0.8],
            [s, s * 0.8],
            [-s, s * 0.8],
          ],
        },
        {
          kind: "polyline",
          close: false,
          points: [
            [-s, s * 0.5],
            [-s * 0.4, -s * 0.1],
            [0, s * 0.3],
            [s * 0.35, -s * 0.05],
            [s, s * 0.55],
          ],
        },
        { kind: "circle", cx: s * 0.55, cy: -s * 0.4, r: s * 0.16 },
      ];

    // A shopping bag: tapered body under a looped handle.
    case "product":
      return [
        {
          kind: "polyline",
          close: true,
          points: [
            [-s * 0.8, -s * 0.35],
            [s * 0.8, -s * 0.35],
            [s * 0.65, s],
            [-s * 0.65, s],
          ],
        },
        {
          kind: "arc",
          cx: 0,
          cy: -s * 0.35,
          r: s * 0.4,
          from: Math.PI,
          to: Math.PI * 2,
        },
      ];
  }
}

/** Sine-waved run of points — the scribbled "text" on a note. */
function squiggle(
  x0: number,
  x1: number,
  y: number,
  steps: number,
  amplitude: number,
  seed: number,
): Point[] {
  const points: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    points.push([
      x0 + (i / steps) * (x1 - x0),
      y + Math.sin(i * 1.9 + seed) * amplitude,
    ]);
  }
  return points;
}

/**
 * Per-point pen wobble. Applied by index along the stroke so a straight edge
 * ripples like a drawn line instead of shifting as a rigid whole.
 */
export function applyWobble(point: Point, index: number, seed: number): Point {
  return [
    point[0] + Math.sin(index * 2.1 + seed) * 0.45,
    point[1] + Math.cos(index * 1.7 + seed) * 0.45,
  ];
}

// The three helpers below run inside Reanimated worklets on the UI thread as
// well as in plain JS (and in tests), so each carries the directive.

/** Progress through `[from, to]`, clamped to 0..1. */
export function span(t: number, from: number, to: number): number {
  "worklet";
  return Math.max(0, Math.min(1, (t - from) / (to - from)));
}

/** Cubic ease-in-out, matching the prototype's timing curve. */
export function easeInOut(t: number): number {
  "worklet";
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Evaluates a CSS `cubic-bezier(x1, y1, x2, y2)` curve at `t`, so the lockup
 * beats keep the exact easing the design was tuned with. Solves x(u) = t by
 * Newton-Raphson, falling back to bisection where the curve is too flat for
 * the derivative to make progress.
 */
export function cubicBezierEase(
  t: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  "worklet";
  if (t <= 0) return 0;
  if (t >= 1) return 1;

  const curve = (a: number, b: number, u: number) => {
    const v = 1 - u;
    return 3 * v * v * u * a + 3 * v * u * u * b + u * u * u;
  };
  const slope = (a: number, b: number, u: number) => {
    const v = 1 - u;
    return 3 * v * v * a + 6 * v * u * (b - a) + 3 * u * u * (1 - b);
  };

  let u = t;
  for (let i = 0; i < 8; i++) {
    const error = curve(x1, x2, u) - t;
    if (Math.abs(error) < 1e-6) return curve(y1, y2, u);
    const d = slope(x1, x2, u);
    if (Math.abs(d) < 1e-6) break;
    u -= error / d;
  }

  let low = 0;
  let high = 1;
  u = t;
  for (let i = 0; i < 20; i++) {
    const x = curve(x1, x2, u);
    if (Math.abs(x - t) < 1e-6) break;
    if (x > t) high = u;
    else low = u;
    u = (low + high) / 2;
  }
  return curve(y1, y2, u);
}
