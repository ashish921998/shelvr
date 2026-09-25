// The drawn vocabulary: type marks, shelves, props, doodles and the icon set.
// Each builder returns finished polylines with the pen wobble already applied,
// so a caller only has to turn them into paths and reveal them along length.
//
// Ported from `shelvr-ink.js` in the design bundle. Coordinates are centred on
// the origin and scaled by `s` (a half-size), except `shelfStrokes`, which is
// laid out in canvas space because a shelf spans a row.

import {
  arc,
  bezier,
  quad,
  wobble,
  WOBBLE,
  type Point,
} from "@/lib/ink/geometry";

/** One pen stroke. `widthScale` multiplies the layer's stroke weight, which is
 * how the article mark gets its heavier heading bar and the shelf its board. */
export type Stroke = { points: Point[]; widthScale?: number };

export type MarkKind =
  | "note"
  | "recipe"
  | "article"
  | "photo"
  | "product"
  | "video"
  | "camera";

export type PropKind = "mug" | "plant" | "clock" | "candle" | "books";

export type DoodleKind = "magnifier" | "hand" | "sun" | "mug" | "recipe";

const TAU = Math.PI * 2;

/** Closes a polyline by repeating its first point. */
function close(points: Point[]): Point[] {
  return points.length ? [...points, points[0]] : points;
}

/** A wobbled polyline through the given points, at mark amplitude. */
function marked(points: Point[], seed: number): Point[] {
  return wobble(points, WOBBLE.mark, seed);
}

/** The scribbled text lines inside a note mark. They carry their own waviness,
 * so the pen wobble is not applied on top. */
function squiggle(
  x0: number,
  x1: number,
  y: number,
  segments: number,
  amp: number,
  seed: number,
): Point[] {
  const pts: Point[] = [];
  for (let k = 0; k <= segments; k++) {
    pts.push([
      x0 + (k / segments) * (x1 - x0),
      y + Math.sin(k * 1.9 + seed) * amp,
    ]);
  }
  return pts;
}

/**
 * A save-type mark — the sticker pinned to a card's top-left corner and the
 * icon beside a shelf name. `video` draws the photo mark; its play triangle is
 * a fill and is returned separately by `markFill`.
 */
export function markStrokes(kind: MarkKind, s: number, seed = 0): Stroke[] {
  const type =
    kind === "video" ? "photo" : kind === "camera" ? "product" : kind;
  if (type === "note") {
    return [
      {
        points: marked(
          close([
            [-s * 0.8, -s],
            [s * 0.35, -s],
            [s * 0.8, -s * 0.55],
            [s * 0.8, s],
            [-s * 0.8, s],
          ]),
          seed,
        ),
      },
      {
        points: marked(
          [
            [s * 0.35, -s],
            [s * 0.35, -s * 0.55],
            [s * 0.8, -s * 0.55],
          ],
          seed,
        ),
      },
      { points: squiggle(-s * 0.5, s * 0.45, -s * 0.15, 6, s * 0.09, seed) },
      { points: squiggle(-s * 0.5, s * 0.2, s * 0.4, 5, s * 0.09, seed) },
    ];
  }
  if (type === "recipe") {
    return [
      { points: arc(0, -s * 0.05, s * 0.95, 0.05, Math.PI - 0.05, 28) },
      {
        points: marked(
          [
            [-s, -s * 0.05],
            [s, -s * 0.05],
          ],
          seed,
        ),
      },
      {
        points: marked(
          [
            [-s * 0.35, s * 0.9],
            [s * 0.35, s * 0.9],
          ],
          seed,
        ),
      },
      {
        points: quad(
          [-s * 0.35, -s * 0.35],
          [-s * 0.55, -s * 0.7],
          [-s * 0.3, -s * 1.05],
          12,
        ),
      },
      {
        points: quad(
          [s * 0.2, -s * 0.35],
          [0, -s * 0.7],
          [s * 0.25, -s * 1.05],
          12,
        ),
      },
    ];
  }
  if (type === "article") {
    return [
      {
        points: marked(
          close([
            [-s * 0.8, -s],
            [s * 0.8, -s],
            [s * 0.8, s],
            [-s * 0.8, s],
          ]),
          seed,
        ),
      },
      {
        points: marked(
          [
            [-s * 0.5, -s * 0.6],
            [s * 0.2, -s * 0.6],
          ],
          seed,
        ),
        widthScale: 1.8,
      },
      {
        points: marked(
          [
            [-s * 0.5, -s * 0.15],
            [s * 0.5, -s * 0.15],
          ],
          seed,
        ),
      },
      {
        points: marked(
          [
            [-s * 0.5, s * 0.2],
            [s * 0.5, s * 0.2],
          ],
          seed,
        ),
      },
      {
        points: marked(
          [
            [-s * 0.5, s * 0.55],
            [s * 0.1, s * 0.55],
          ],
          seed,
        ),
      },
    ];
  }
  if (type === "photo") {
    const strokes: Stroke[] = [
      {
        points: marked(
          close([
            [-s, -s * 0.8],
            [s, -s * 0.8],
            [s, s * 0.8],
            [-s, s * 0.8],
          ]),
          seed,
        ),
      },
      {
        points: marked(
          [
            [-s, s * 0.5],
            [-s * 0.4, -s * 0.1],
            [0, s * 0.3],
            [s * 0.35, -s * 0.05],
            [s, s * 0.55],
          ],
          seed,
        ),
      },
      { points: arc(s * 0.55, -s * 0.4, s * 0.16, 0, TAU, 14) },
    ];
    return strokes;
  }
  // product: a shopping bag with a handle. `camera` is the same body with a
  // lens, so the two share this branch.
  const bag: Stroke[] = [
    {
      points: marked(
        close([
          [-s * 0.8, -s * 0.35],
          [s * 0.8, -s * 0.35],
          [s * 0.65, s],
          [-s * 0.65, s],
        ]),
        seed,
      ),
    },
    { points: arc(0, -s * 0.35, s * 0.4, Math.PI, TAU, 16) },
  ];
  if (kind === "camera")
    bag.push({ points: arc(0, s * 0.15, s * 0.3, 0, TAU, 16) });
  return bag;
}

/** The filled play triangle that turns a photo mark into a video mark. */
export function markFill(kind: MarkKind, s: number): Point[] | null {
  if (kind !== "video") return null;
  return [
    [-s * 0.23, -s * 0.33],
    [s * 0.33, 0],
    [-s * 0.23, s * 0.33],
    [-s * 0.23, -s * 0.33],
  ];
}

/** Progress windows for the three parts of a shelf: the board draws first, the
 * underside follows, the brackets land last. */
export const SHELF_PHASES = {
  board: [0, 0.35],
  under: [0.35, 0.8],
  brackets: [0.8, 1],
} as const;

/** A shelf: a thick board, its underside 5px below, and two small brackets set
 * 22px in from each end. Laid out in canvas coordinates. */
export function shelfStrokes(
  x0: number,
  x1: number,
  y: number,
  seed = 0,
): { board: Stroke; under: Stroke; brackets: Stroke[] } {
  const segments = 60;
  const top: Point[] = [];
  const under: Point[] = [];
  for (let k = 0; k <= segments; k++) {
    const x = x0 + (k / segments) * (x1 - x0);
    top.push([x, y + Math.sin(k * 0.7 + seed) * 0.6]);
    under.push([x, y + 5 + Math.cos(k * 0.9 + seed) * 0.5]);
  }
  return {
    board: { points: wobble(top, WOBBLE.line, seed), widthScale: 1.9 },
    under: { points: wobble(under, WOBBLE.line, seed + 1), widthScale: 0.9 },
    brackets: [x0 + 22, x1 - 22].map((bx) => ({
      points: wobble(
        bezier(
          [bx, y + 6],
          [bx - 2, y + 12],
          [bx + 8, y + 16],
          [bx + 10, y + 22],
          12,
        ),
        WOBBLE.line,
        seed + 2,
      ),
    })),
  };
}

/** A shelf prop. At most one stands on any shelf. */
export function propStrokes(kind: PropKind, s: number, seed = 0): Stroke[] {
  const w = (points: Point[]) => wobble(points, WOBBLE.prop, seed);
  if (kind === "plant") {
    const strokes: Stroke[] = [
      {
        points: w(
          close([
            [-s * 0.5, s * 0.2],
            [s * 0.5, s * 0.2],
            [s * 0.4, s],
            [-s * 0.4, s],
          ]),
        ),
      },
    ];
    for (const [dx, rot] of [
      [0, 0],
      [-0.55, -0.7],
      [0.55, 0.7],
    ] as const) {
      const tipX = dx * s * 1.1;
      const tipY = -s * (1.1 - Math.abs(dx) * 0.5);
      strokes.push({
        points: quad(
          [0, s * 0.2],
          [dx * s * 0.6 - s * 0.35 * Math.sign(dx || 1) * 0.3, -s * 0.5],
          [tipX, tipY],
          14,
        ),
      });
      // A leaf: an ellipse rotated onto the stem's direction.
      strokes.push({
        points: arc(0, 0, s * 0.28, 0, TAU, 18, s * 0.14).map(
          ([x, y]) =>
            [
              tipX + x * Math.cos(rot) - y * Math.sin(rot),
              tipY + x * Math.sin(rot) + y * Math.cos(rot),
            ] as Point,
        ),
      });
    }
    return strokes;
  }
  if (kind === "mug") {
    return [
      {
        points: w(
          close([
            [-s * 0.6, -s * 0.5],
            [s * 0.5, -s * 0.5],
            [s * 0.4, s],
            [-s * 0.5, s],
          ]),
        ),
      },
      {
        points: arc(
          s * 0.62,
          s * 0.15,
          s * 0.32,
          -Math.PI / 2,
          Math.PI / 2,
          16,
        ),
      },
      {
        points: quad(
          [-s * 0.25, -s * 0.75],
          [-s * 0.4, -s * 1.05],
          [-s * 0.2, -s * 1.3],
          10,
        ),
      },
      {
        points: quad(
          [s * 0.15, -s * 0.75],
          [0, -s * 1.05],
          [s * 0.2, -s * 1.3],
          10,
        ),
      },
    ];
  }
  if (kind === "clock") {
    return [
      { points: arc(0, 0, s, 0, TAU, 28) },
      {
        points: w([
          [0, 0],
          [0, -s * 0.6],
        ]),
      },
      {
        points: w([
          [0, 0],
          [s * 0.42, s * 0.15],
        ]),
      },
      {
        points: w([
          [-s * 0.45, s * 0.9],
          [-s * 0.6, s * 1.25],
        ]),
      },
      {
        points: w([
          [s * 0.45, s * 0.9],
          [s * 0.6, s * 1.25],
        ]),
      },
    ];
  }
  if (kind === "candle") {
    return [
      {
        points: w(
          close([
            [-s * 0.35, -s * 0.3],
            [s * 0.35, -s * 0.3],
            [s * 0.35, s],
            [-s * 0.35, s],
          ]),
        ),
      },
      {
        points: w([
          [0, -s * 0.3],
          [0, -s * 0.6],
        ]),
      },
      {
        points: [
          ...quad([0, -s * 0.6], [s * 0.3, -s * 0.9], [0, -s * 1.25], 10),
          ...quad([0, -s * 1.25], [-s * 0.3, -s * 0.9], [0, -s * 0.6], 10),
        ],
      },
    ];
  }
  // books: two upright spines and one leaning against them.
  const lean = (points: Point[]): Point[] =>
    points.map(([x, y]) => {
      const a = 0.35;
      return [
        s * 0.55 + x * Math.cos(a) - y * Math.sin(a),
        s * 0.2 + x * Math.sin(a) + y * Math.cos(a),
      ] as Point;
    });
  return [
    {
      points: w(
        close([
          [-s, s],
          [-s, -s * 0.6],
          [-s * 0.45, -s * 0.6],
          [-s * 0.45, s],
        ]),
      ),
    },
    {
      points: w(
        close([
          [-s * 0.4, s],
          [-s * 0.4, -s * 0.9],
          [s * 0.15, -s * 0.9],
          [s * 0.15, s],
        ]),
      ),
    },
    {
      points: w(
        lean(
          close([
            [-s * 0.3, s * 0.8],
            [-s * 0.3, -s * 0.7],
            [s * 0.3, -s * 0.7],
            [s * 0.3, s * 0.8],
          ]),
        ),
      ),
    },
  ];
}

/** A headline doodle. One per screen at most, and never alongside a circled
 * word. */
export function doodleStrokes(kind: DoodleKind, s: number, seed = 0): Stroke[] {
  const w = (points: Point[]) => wobble(points, WOBBLE.prop, seed);
  if (kind === "magnifier") {
    return [
      { points: arc(-s * 0.2, -s * 0.2, s * 0.6, 0, TAU, 28) },
      {
        points: w([
          [s * 0.25, s * 0.25],
          [s * 0.8, s * 0.8],
        ]),
        widthScale: 1.6,
      },
      {
        points: arc(
          -s * 0.35,
          -s * 0.38,
          s * 0.28,
          Math.PI * 1.1,
          Math.PI * 1.6,
          12,
        ),
      },
    ];
  }
  if (kind === "hand") {
    return [
      {
        points: w(
          close([
            [-s * 0.9, -s * 0.2],
            [-s * 0.2, -s * 0.2],
            [-s * 0.2, s * 0.7],
            [-s * 0.9, s * 0.7],
          ]),
        ),
      },
      {
        points: [
          ...quad(
            [-s * 0.1, s * 0.1],
            [s * 0.3, -s * 0.9],
            [s * 0.7, -s * 0.5],
            12,
          ),
          ...quad(
            [s * 0.7, -s * 0.5],
            [s * 0.95, -s * 0.2],
            [s * 0.8, s * 0.3],
            12,
          ),
          ...quad(
            [s * 0.8, s * 0.3],
            [s * 0.7, s * 0.8],
            [s * 0.2, s * 0.85],
            12,
          ),
          ...quad(
            [s * 0.2, s * 0.85],
            [-s * 0.05, s * 0.8],
            [-s * 0.1, s * 0.5],
            10,
          ),
        ],
      },
      {
        points: quad(
          [s * 0.35, -s * 0.15],
          [s * 0.55, -s * 0.25],
          [s * 0.7, -s * 0.05],
          8,
        ),
      },
      {
        points: quad(
          [s * 0.4, s * 0.15],
          [s * 0.6, s * 0.05],
          [s * 0.75, s * 0.25],
          8,
        ),
      },
    ];
  }
  if (kind === "sun") {
    const strokes: Stroke[] = [{ points: arc(0, 0, s * 0.45, 0, TAU, 24) }];
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * TAU + seed;
      const outer = s * (0.85 + (k % 2) * 0.15);
      strokes.push({
        points: w([
          [Math.cos(a) * s * 0.62, Math.sin(a) * s * 0.62],
          [Math.cos(a) * outer, Math.sin(a) * outer],
        ]),
      });
    }
    return strokes;
  }
  if (kind === "mug") return propStrokes("mug", s * 0.55, seed);
  return markStrokes("recipe", s * 0.85, seed);
}
