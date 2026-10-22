export const DESIGN_WIDTH = 390;

export const CENTER_X = 195;
export const CENTER_Y = 388;

export const SHELF_Y = CENTER_Y + 48;
export const SHELF_WIDTH = 240;

export const MARK_COUNT = 30;
export const DUST_COUNT = 56;

export const SCHEDULE = {
  appearDuration: 0.16,
  appearFrom: 0.14,
  appearSpread: 0.52,
  travelFrom: 0.68,
  travelSpread: 0.26,
  travelDurationFrom: 0.36,
  travelDurationSpread: 0.12,
  dustDuration: 0.18,
  dustFrom: 0.09,
  dustSpread: 0.58,
} as const;

export const TRAVEL_LIFT = 26;
export const STITCH_HALF_WIDTH = 3.4;

type SaveType = "note" | "recipe" | "article" | "photo" | "product";

const SAVE_TYPES: SaveType[] = [
  "note",
  "recipe",
  "article",
  "photo",
  "product",
];

type InkTone = "ink" | "accent" | "cool";

export type Mark = {
  x: number;
  y: number;
  type: SaveType;
  size: number;
  rotation: number;
  tone: InkTone;
  appearAt: number;
  travelAt: number;
  travelDuration: number;
  wobble: number;
  slot: number;
};

export type Dust = {
  x: number;
  y: number;
  appearAt: number;
  radius: number;
};

export type Point = readonly [number, number];

export type Stroke =
  | { kind: "polyline"; points: Point[]; close: boolean; heavy?: boolean }
  | { kind: "squiggle"; points: Point[] }
  | { kind: "arc"; cx: number; cy: number; r: number; from: number; to: number }
  | { kind: "circle"; cx: number; cy: number; r: number }
  | { kind: "quad"; from: Point; control: Point; to: Point };

export type Composition = {
  threadAbove: Point[];
  threadBelow: Point[];
  marks: Mark[];
  dust: Dust[];
};

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

function threadXAt(above: Point[], below: Point[], y: number): number {
  const points = y < CENTER_Y ? above : below;
  let nearest = points[0];
  for (const point of points) {
    if (Math.abs(point[1] - y) < Math.abs(nearest[1] - y)) nearest = point;
  }
  return nearest[0];
}

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
      appearAt: SCHEDULE.appearFrom + random() * SCHEDULE.appearSpread,
      travelAt: SCHEDULE.travelFrom + random() * SCHEDULE.travelSpread,
      travelDuration:
        SCHEDULE.travelDurationFrom + random() * SCHEDULE.travelDurationSpread,
      wobble: random() * 10,
      slot: i,
    });
  }

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
      appearAt: SCHEDULE.dustFrom + random() * SCHEDULE.dustSpread,
      radius: 0.6 + random() * 0.6,
    });
  }

  return { threadAbove, threadBelow, marks, dust };
}

export function shelfSlotX(slot: number): number {
  return CENTER_X - SHELF_WIDTH / 2 + (slot / (MARK_COUNT - 1)) * SHELF_WIDTH;
}

export function glyphStrokes(mark: Mark): Stroke[] {
  const s = mark.size;

  switch (mark.type) {
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

export function applyWobble(point: Point, index: number, seed: number): Point {
  return [
    point[0] + Math.sin(index * 2.1 + seed) * 0.45,
    point[1] + Math.cos(index * 1.7 + seed) * 0.45,
  ];
}

export function span(t: number, from: number, to: number): number {
  "worklet";
  return Math.max(0, Math.min(1, (t - from) / (to - from)));
}

export function easeInOut(t: number): number {
  "worklet";
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

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
