// The hand-drawn icon set. Every icon in the app is drawn rather than set from
// a symbol font (decision 2026-09-18, reversing the earlier "chrome, not ink"
// rule); the only exception is the amber sparkle on a suggested card, which
// stays a filled symbol so "suggested" reads as a different kind of thing.
//
// Icons are keyed by the SF Symbol names the app already passes to
// `AppSymbolIcon`, so swapping a call site is a one-line change.

import { arc, wobble, type Point } from "@/lib/ink/geometry";
import type { Stroke } from "@/lib/ink/strokes";

const PI = Math.PI;
const TAU = PI * 2;

/** Names this set draws. Anything else falls back to a crossed box, which is
 * deliberately ugly so a missing icon is caught in review rather than shipped. */
export type InkIconName =
  | "square.grid.2x2"
  | "square.grid.2x2.fill"
  | "rectangle.stack"
  | "rectangle.stack.fill"
  | "photo.stack"
  | "photo.on.rectangle.angled"
  | "map"
  | "magnifyingglass"
  | "plus"
  | "xmark"
  | "checkmark"
  | "chevron.left"
  | "chevron.right"
  | "chevron.down"
  | "arrow.up"
  | "arrow.up.right"
  | "ellipsis"
  | "trash"
  | "arrow.uturn.backward"
  | "arrow.clockwise"
  | "arrow.2.circlepath"
  | "person.fill"
  | "person"
  | "square.and.arrow.up"
  | "tray.and.arrow.up"
  | "calendar"
  | "safari"
  | "gearshape"
  | "gearshape.fill"
  | "sparkles"
  | "star.fill"
  | "heart"
  | "camera"
  | "link"
  | "doc.on.doc"
  | "doc.text"
  | "bag"
  | "envelope"
  | "message"
  | "phone"
  | "house.fill"
  | "play.fill"
  | "play.rectangle"
  | "info.circle"
  | "exclamationmark.circle"
  | "checkmark.circle.fill"
  | "square.and.pencil"
  | "viewfinder";

/** The pen a group of icons is drawn with. Each group gets its own so the
 * switch statements stay small enough to read (and to lint). */
function pen() {
  const S: Point[][] = [];
  const L = (...p: Point[]) => S.push(p);
  const R = (x0: number, y0: number, x1: number, y1: number) =>
    L([x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]);
  const A = (
    cx: number,
    cy: number,
    r: number,
    a0: number,
    a1: number,
    n = 24,
    ry?: number,
  ) => S.push(arc(cx, cy, r, a0, a1, n, ry));
  // An open circle: the pen starts off-axis and overshoots, so it never closes
  // cleanly the way a geometric circle would.
  const C = (cx: number, cy: number, r: number, ry?: number) =>
    A(cx, cy, r, -PI * 0.6, PI * 1.45, 28, ry);
  return { S, L, R, A, C };
}

/** The five tabs, plus the surfaces they lead to. */
function tabIcons(name: string): Point[][] | null {
  const { S, L, R, A, C } = pen();
  switch (name) {
    case "square.grid.2x2":
    case "square.grid.2x2.fill":
      for (const [x, y] of [
        [-0.5, -0.5],
        [0.5, -0.5],
        [-0.5, 0.5],
        [0.5, 0.5],
      ] as const) {
        R(x - 0.36, y - 0.36, x + 0.36, y + 0.36);
      }
      return S;
    case "rectangle.stack":
    case "rectangle.stack.fill":
      R(-0.9, -0.1, 0.9, 0.8);
      L([-0.7, -0.42], [0.7, -0.42]);
      L([-0.5, -0.75], [0.5, -0.75]);
      return S;
    case "photo.stack":
      R(-0.85, -0.45, 0.6, 0.8);
      L([-0.85, 0.45], [-0.4, -0.05], [-0.05, 0.3], [0.25, 0.05], [0.6, 0.5]);
      L([-0.55, -0.75], [0.9, -0.75], [0.9, 0.5]);
      return S;
    case "map":
      L(
        [-0.9, -0.55],
        [-0.3, -0.85],
        [0.3, -0.55],
        [0.9, -0.85],
        [0.9, 0.55],
        [0.3, 0.85],
        [-0.3, 0.55],
        [-0.9, 0.85],
        [-0.9, -0.55],
      );
      L([-0.3, -0.85], [-0.3, 0.55]);
      L([0.3, -0.55], [0.3, 0.85]);
      return S;
    case "magnifyingglass":
      C(-0.2, -0.2, 0.55);
      L([0.2, 0.2], [0.85, 0.85]);
      return S;
    case "house.fill":
      L([-0.85, 0.05], [0, -0.8], [0.85, 0.05]);
      L([-0.6, -0.2], [-0.6, 0.85], [0.6, 0.85], [0.6, -0.2]);
      L([-0.15, 0.85], [-0.15, 0.3], [0.15, 0.3], [0.15, 0.85]);
      return S;
    case "person.fill":
    case "person":
      C(0, -0.4, 0.33);
      A(0, 1.05, 0.9, -PI * 0.83, -PI * 0.17, 20);
      return S;
    default:
      return null;
  }
}

/** Header buttons and the small marks that sit inside a control. */
function chromeIcons(name: string): Point[][] | null {
  const { S, L, A, C } = pen();
  switch (name) {
    case "plus":
      L([-0.8, 0], [0.8, 0]);
      L([0, -0.8], [0, 0.8]);
      return S;
    case "xmark":
      L([-0.65, -0.65], [0.65, 0.65]);
      L([0.65, -0.65], [-0.65, 0.65]);
      return S;
    case "checkmark":
      L([-0.75, 0.05], [-0.22, 0.58], [0.78, -0.58]);
      return S;
    case "chevron.left":
      L([0.35, -0.75], [-0.4, 0], [0.35, 0.75]);
      return S;
    case "chevron.right":
      L([-0.35, -0.75], [0.4, 0], [-0.35, 0.75]);
      return S;
    case "chevron.down":
      L([-0.75, -0.35], [0, 0.4], [0.75, -0.35]);
      return S;
    case "arrow.up":
      L([0, 0.85], [0, -0.8]);
      L([-0.55, -0.3], [0, -0.85], [0.55, -0.3]);
      return S;
    case "arrow.up.right":
      L([-0.65, 0.65], [0.65, -0.65]);
      L([-0.1, -0.65], [0.65, -0.65], [0.65, 0.1]);
      return S;
    case "ellipsis":
      for (const x of [-0.6, 0, 0.6]) A(x, 0, 0.13, 0, TAU, 10);
      return S;
    case "trash":
      L([-0.85, -0.55], [0.85, -0.55]);
      L([-0.25, -0.55], [-0.2, -0.85], [0.2, -0.85], [0.25, -0.55]);
      L([-0.65, -0.55], [-0.55, 0.85], [0.55, 0.85], [0.65, -0.55]);
      L([-0.2, -0.25], [-0.17, 0.55]);
      L([0.2, -0.25], [0.17, 0.55]);
      return S;
    case "arrow.uturn.backward": {
      const p: Point[] = [
        [0.55, 0.85],
        [0.55, 0.05],
      ];
      for (let k = 0; k <= 20; k++) {
        const a = -(k / 20) * PI;
        p.push([Math.cos(a) * 0.55, Math.sin(a) * 0.55]);
      }
      p.push([-0.55, 0.45]);
      L(...p);
      L([-0.9, 0.12], [-0.55, 0.55], [-0.2, 0.12]);
      return S;
    }
    case "arrow.clockwise":
    case "arrow.2.circlepath":
      A(0, 0, 0.7, -PI * 0.25, PI * 1.35, 30);
      L([0.35, -0.85], [0.55, -0.45], [0.1, -0.35]);
      return S;
    case "gearshape":
    case "gearshape.fill":
      C(0, 0, 0.33);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * TAU;
        L(
          [Math.cos(a) * 0.58, Math.sin(a) * 0.58],
          [Math.cos(a) * 0.88, Math.sin(a) * 0.88],
        );
      }
      A(0, 0, 0.6, -PI * 0.6, PI * 1.45, 32);
      return S;
    case "viewfinder":
      L([-0.85, -0.35], [-0.85, -0.85], [-0.35, -0.85]);
      L([0.35, -0.85], [0.85, -0.85], [0.85, -0.35]);
      L([0.85, 0.35], [0.85, 0.85], [0.35, 0.85]);
      L([-0.35, 0.85], [-0.85, 0.85], [-0.85, 0.35]);
      return S;
    case "info.circle":
    case "exclamationmark.circle":
      C(0, 0, 0.85);
      L([0, -0.1], [0, 0.5]);
      A(0, -0.42, 0.06, 0, TAU, 6);
      return S;
    case "checkmark.circle.fill":
      C(0, 0, 0.85);
      L([-0.45, 0.02], [-0.12, 0.38], [0.5, -0.38]);
      return S;
    default:
      return null;
  }
}

/** What a save can be: a page, a photo, a clip, a bag, a note. */
function contentIcons(name: string): Point[][] | null {
  const { S, L, R, A, C } = pen();
  switch (name) {
    case "photo.on.rectangle.angled": {
      const rot = -0.14;
      const P = (x: number, y: number): Point => [
        x * Math.cos(rot) - y * Math.sin(rot),
        x * Math.sin(rot) + y * Math.cos(rot),
      ];
      L(
        P(-0.85, -0.55),
        P(0.85, -0.55),
        P(0.85, 0.6),
        P(-0.85, 0.6),
        P(-0.85, -0.55),
      );
      L(P(-0.85, 0.3), P(-0.4, -0.15), P(0, 0.2), P(0.3, -0.05), P(0.85, 0.4));
      A(0.45, -0.25, 0.14, 0, TAU, 12);
      return S;
    }
    case "camera":
      R(-0.85, -0.35, 0.85, 0.65);
      L([-0.3, -0.35], [-0.2, -0.65], [0.2, -0.65], [0.3, -0.35]);
      C(0, 0.15, 0.3);
      return S;
    case "link": {
      const rot = -PI / 4;
      const ring = (cx: number, cy: number) => {
        const p: Point[] = [];
        for (let k = 0; k <= 24; k++) {
          const a = (k / 24) * TAU;
          const x = Math.cos(a) * 0.5;
          const y = Math.sin(a) * 0.26;
          p.push([
            cx + x * Math.cos(rot) - y * Math.sin(rot),
            cy + x * Math.sin(rot) + y * Math.cos(rot),
          ]);
        }
        L(...p);
      };
      ring(-0.28, 0.28);
      ring(0.28, -0.28);
      return S;
    }
    case "doc.on.doc":
      L([-0.3, -0.45], [-0.3, -0.85], [0.6, -0.85], [0.6, 0.4], [0.25, 0.4]);
      R(-0.65, -0.45, 0.25, 0.85);
      return S;
    case "doc.text":
      R(-0.6, -0.85, 0.6, 0.85);
      L([-0.35, -0.35], [0.35, -0.35]);
      L([-0.35, 0.05], [0.35, 0.05]);
      L([-0.35, 0.45], [0.05, 0.45]);
      return S;
    case "bag":
      L([-0.75, -0.3], [0.75, -0.3], [0.6, 0.85], [-0.6, 0.85], [-0.75, -0.3]);
      A(0, -0.3, 0.38, PI, TAU, 14);
      return S;
    case "play.fill":
    case "play.rectangle":
      L([-0.55, -0.75], [0.75, 0], [-0.55, 0.75], [-0.55, -0.75]);
      return S;
    case "square.and.pencil":
      L([0.1, -0.7], [-0.75, -0.7], [-0.75, 0.8], [0.75, 0.8], [0.75, -0.05]);
      L(
        [-0.25, 0.3],
        [0.65, -0.6],
        [0.85, -0.4],
        [-0.05, 0.5],
        [-0.3, 0.55],
        [-0.25, 0.3],
      );
      return S;
    case "safari":
      C(0, 0, 0.85);
      L(
        [-0.45, 0.45],
        [0.12, -0.12],
        [0.45, -0.45],
        [-0.12, 0.12],
        [-0.45, 0.45],
      );
      return S;
    default:
      return null;
  }
}

/** Sharing, sending, and the marks that stand for a moment rather than a thing. */
function socialIcons(name: string): Point[][] | null {
  const { S, L, R, A } = pen();
  switch (name) {
    case "square.and.arrow.up":
      L(
        [-0.35, -0.15],
        [-0.7, -0.15],
        [-0.7, 0.85],
        [0.7, 0.85],
        [0.7, -0.15],
        [0.35, -0.15],
      );
      L([0, 0.4], [0, -0.85]);
      L([-0.35, -0.5], [0, -0.85], [0.35, -0.5]);
      return S;
    case "tray.and.arrow.up":
      L([-0.85, 0.3], [-0.85, 0.85], [0.85, 0.85], [0.85, 0.3]);
      L([0, 0.5], [0, -0.85]);
      L([-0.35, -0.5], [0, -0.85], [0.35, -0.5]);
      return S;
    case "calendar":
      R(-0.8, -0.5, 0.8, 0.8);
      L([-0.8, -0.12], [0.8, -0.12]);
      L([-0.4, -0.85], [-0.4, -0.3]);
      L([0.4, -0.85], [0.4, -0.3]);
      A(-0.35, 0.32, 0.08, 0, TAU, 8);
      A(0.1, 0.32, 0.08, 0, TAU, 8);
      return S;
    case "envelope":
      R(-0.85, -0.6, 0.85, 0.6);
      L([-0.85, -0.6], [0, 0.1], [0.85, -0.6]);
      return S;
    case "message":
      L(
        [-0.85, -0.2],
        [-0.7, -0.65],
        [0.7, -0.65],
        [0.85, -0.2],
        [0.85, 0.3],
        [0.7, 0.55],
        [-0.2, 0.55],
        [-0.6, 0.85],
        [-0.55, 0.55],
        [-0.7, 0.55],
        [-0.85, 0.3],
        [-0.85, -0.2],
      );
      return S;
    case "phone":
      L(
        [-0.7, -0.75],
        [-0.3, -0.85],
        [0, -0.3],
        [-0.25, -0.05],
        [0.05, 0.25],
        [0.3, 0],
        [0.85, 0.3],
        [0.75, 0.7],
        [0.3, 0.85],
        [-0.4, 0.4],
        [-0.85, -0.3],
        [-0.7, -0.75],
      );
      return S;
    case "sparkles":
      L(
        [0, -0.85],
        [0.17, -0.17],
        [0.85, 0],
        [0.17, 0.17],
        [0, 0.85],
        [-0.17, 0.17],
        [-0.85, 0],
        [-0.17, -0.17],
        [0, -0.85],
      );
      L(
        [0.62, -0.85],
        [0.68, -0.68],
        [0.85, -0.62],
        [0.68, -0.56],
        [0.62, -0.4],
        [0.56, -0.56],
        [0.4, -0.62],
        [0.56, -0.68],
        [0.62, -0.85],
      );
      return S;
    case "star.fill": {
      const p: Point[] = [];
      for (let k = 0; k <= 10; k++) {
        const a = -PI / 2 + (k / 10) * TAU;
        const r = k % 2 ? 0.38 : 0.85;
        p.push([Math.cos(a) * r, Math.sin(a) * r]);
      }
      L(...p);
      return S;
    }
    case "heart":
      L(
        [0, 0.8],
        [-0.8, 0],
        [-0.8, -0.35],
        [-0.55, -0.7],
        [-0.25, -0.7],
        [0, -0.4],
        [0.25, -0.7],
        [0.55, -0.7],
        [0.8, -0.35],
        [0.8, 0],
        [0, 0.8],
      );
      return S;
    default:
      return null;
  }
}

/** Builds the unit-space polylines for one icon. Coordinates run roughly
 * -1..1 and are scaled by the caller. An unknown name gets a crossed box,
 * which is deliberately ugly so it is caught in review rather than shipped. */
function unitStrokes(name: string): Point[][] {
  const drawn =
    tabIcons(name) ??
    chromeIcons(name) ??
    contentIcons(name) ??
    socialIcons(name);
  if (drawn) return drawn;
  const { S, L, R } = pen();
  R(-0.7, -0.7, 0.7, 0.7);
  L([-0.7, 0.7], [0.7, -0.7]);
  return S;
}

/** Stroke weight for an icon. One weight per icon, never mixed — a rule from
 * the spec's "never" list. */
export function iconStrokeWidth(size: number): number {
  return Math.max(1.3, size * 0.075);
}

/**
 * The polylines for one icon, centred on the origin.
 * `size` is the icon's full box (nav 22, header buttons 18, inline 14–16).
 */
export function iconStrokes(name: string, size: number, seed = 0): Stroke[] {
  const half = size / 2;
  const unit = half * 0.78;
  const amp = half * 0.03;
  const preset = { ax: amp, ay: amp, fx: 0.7, fy: 0.9 };
  const widthScale = name === "ellipsis" ? 1.5 : undefined;
  return unitStrokes(name).map((points) => ({
    points: wobble(
      points.map(([x, y]) => [x * unit, y * unit] as Point),
      preset,
      seed,
    ),
    widthScale,
  }));
}
