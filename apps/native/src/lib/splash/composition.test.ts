import { describe, expect, it } from "vitest";

import {
  buildComposition,
  CENTER_X,
  CENTER_Y,
  cubicBezierEase,
  DESIGN_WIDTH,
  DUST_COUNT,
  easeInOut,
  glyphStrokes,
  MARK_COUNT,
  shelfSlotX,
  SHELF_WIDTH,
  span,
  type Mark,
} from "./composition";

describe("buildComposition", () => {
  it("is deterministic, so the scatter is identical on every launch", () => {
    const a = buildComposition();
    const b = buildComposition();
    expect(b).toEqual(a);
  });

  it("changes with the seed", () => {
    expect(buildComposition(11)).not.toEqual(buildComposition(7));
  });

  it("draws the thread in two segments meeting at the centre", () => {
    const { threadAbove, threadBelow } = buildComposition();
    // The x wobble is applied to every sample, so the join is compared on y.
    expect(threadAbove.at(-1)?.[1]).toBeCloseTo(CENTER_Y, 5);
    expect(threadBelow[0][1]).toBeCloseTo(CENTER_Y, 5);
    expect(threadAbove[0][1]).toBeLessThan(0);
    expect(threadBelow.at(-1)?.[1]).toBeGreaterThan(CENTER_Y);
  });

  it("keeps every mark on screen and gives it a full schedule", () => {
    const { marks } = buildComposition();
    expect(marks).toHaveLength(MARK_COUNT);
    for (const mark of marks) {
      expect(mark.x).toBeGreaterThanOrEqual(18);
      expect(mark.x).toBeLessThanOrEqual(DESIGN_WIDTH - 18);
      expect(mark.y).toBeGreaterThanOrEqual(70);
      expect(mark.size).toBeGreaterThan(0);
      // Each mark has to be visible before it starts travelling, or it would
      // pop into existence already sliding towards the shelf.
      expect(mark.appearAt).toBeLessThan(mark.travelAt);
      expect(mark.travelDuration).toBeGreaterThan(0);
    }
  });

  it("gives every mark a distinct shelf slot", () => {
    const { marks } = buildComposition();
    const slots = marks.map((mark) => mark.slot).sort((a, b) => a - b);
    expect(slots).toEqual([...Array(MARK_COUNT).keys()]);
  });

  it("shuffles the slots away from arrival order, so travel paths cross", () => {
    const { marks } = buildComposition();
    expect(marks.map((mark) => mark.slot)).not.toEqual([
      ...Array(MARK_COUNT).keys(),
    ]);
  });

  it("uses every save type, with ink as the clear majority", () => {
    const { marks } = buildComposition();
    expect(new Set(marks.map((mark) => mark.type)).size).toBe(5);
    const ink = marks.filter((mark) => mark.tone === "ink").length;
    expect(ink / marks.length).toBeGreaterThan(0.5);
  });

  it("scatters dust along the thread", () => {
    const { dust } = buildComposition();
    expect(dust).toHaveLength(DUST_COUNT);
    for (const mote of dust) {
      expect(mote.radius).toBeGreaterThan(0);
      expect(mote.appearAt).toBeGreaterThan(0);
    }
  });
});

describe("shelfSlotX", () => {
  it("spans the shelf, centred on the composition", () => {
    expect(shelfSlotX(0)).toBeCloseTo(CENTER_X - SHELF_WIDTH / 2, 5);
    expect(shelfSlotX(MARK_COUNT - 1)).toBeCloseTo(
      CENTER_X + SHELF_WIDTH / 2,
      5,
    );
    // Evenly spaced, so the settled row reads as one tidy run of stitches.
    const gap = shelfSlotX(1) - shelfSlotX(0);
    expect(shelfSlotX(20) - shelfSlotX(19)).toBeCloseTo(gap, 5);
  });
});

describe("glyphStrokes", () => {
  const mark = (type: Mark["type"]): Mark => ({
    x: 0,
    y: 0,
    type,
    size: 8,
    rotation: 0,
    tone: "ink",
    appearAt: 0,
    travelAt: 1,
    travelDuration: 1,
    wobble: 3,
    slot: 0,
  });

  it.each(["note", "recipe", "article", "photo", "product"] as const)(
    "describes a %s",
    (type) => {
      const strokes = glyphStrokes(mark(type));
      expect(strokes.length).toBeGreaterThan(0);
      for (const stroke of strokes) {
        if (stroke.kind === "polyline" || stroke.kind === "squiggle") {
          expect(stroke.points.length).toBeGreaterThan(1);
        }
      }
    },
  );

  it("gives the article a heavy heading bar", () => {
    const heavy = glyphStrokes(mark("article")).filter(
      (stroke) => stroke.kind === "polyline" && stroke.heavy,
    );
    expect(heavy).toHaveLength(1);
  });

  it("scales with the mark", () => {
    const small = glyphStrokes({ ...mark("photo"), size: 4 });
    const large = glyphStrokes({ ...mark("photo"), size: 8 });
    const radius = (strokes: ReturnType<typeof glyphStrokes>) => {
      const circle = strokes.find((stroke) => stroke.kind === "circle");
      return circle?.kind === "circle" ? circle.r : 0;
    };
    expect(radius(large)).toBeCloseTo(radius(small) * 2, 5);
  });
});

describe("span", () => {
  it("clamps outside the window and runs 0..1 inside it", () => {
    expect(span(0, 1, 2)).toBe(0);
    expect(span(1.5, 1, 2)).toBeCloseTo(0.5, 5);
    expect(span(3, 1, 2)).toBe(1);
  });
});

describe("easeInOut", () => {
  it("pins the ends and passes through the midpoint", () => {
    expect(easeInOut(0)).toBeCloseTo(0, 5);
    expect(easeInOut(0.5)).toBeCloseTo(0.5, 5);
    expect(easeInOut(1)).toBeCloseTo(1, 5);
  });

  it("is monotonic", () => {
    let previous = -1;
    for (let i = 0; i <= 20; i++) {
      const value = easeInOut(i / 20);
      expect(value).toBeGreaterThan(previous);
      previous = value;
    }
  });
});

describe("cubicBezierEase", () => {
  const lockup = (t: number) => cubicBezierEase(t, 0.16, 0.84, 0.24, 1);

  it("pins the ends", () => {
    expect(lockup(0)).toBe(0);
    expect(lockup(1)).toBe(1);
    expect(lockup(-1)).toBe(0);
    expect(lockup(2)).toBe(1);
  });

  it("matches linear for the identity curve", () => {
    for (const t of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      expect(cubicBezierEase(t, 1 / 3, 1 / 3, 2 / 3, 2 / 3)).toBeCloseTo(t, 4);
    }
  });

  it("front-loads the lockup curve, so the slide leads and then settles", () => {
    expect(lockup(0.25)).toBeGreaterThan(0.25);
    expect(lockup(0.5)).toBeGreaterThan(0.8);
  });

  it("is monotonic", () => {
    let previous = -1;
    for (let i = 0; i <= 40; i++) {
      const value = lockup(i / 40);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });

  it("resolves a curve too flat for Newton-Raphson alone", () => {
    // A near-vertical control pair drives the derivative towards zero, which
    // is the case the bisection fallback exists for.
    const value = cubicBezierEase(0.5, 0, 1, 1, 0);
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(1);
  });
});
