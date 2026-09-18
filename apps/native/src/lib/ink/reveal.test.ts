import { describe, expect, it } from "vitest";
import { revealEnds, staggerWindow } from "./reveal";
import type { Stroke } from "./strokes";

const strokes: Stroke[] = [
  {
    points: [
      [0, 0],
      [1, 1],
    ],
  },
  {
    points: [
      [0, 0],
      [1, 1],
      [2, 2],
      [3, 3],
      [4, 4],
      [5, 5],
    ],
  },
];

describe("revealEnds", () => {
  it("draws one stroke at a time, in order", () => {
    expect(revealEnds(strokes, 0)).toEqual([0, 0]);
    // A quarter of the eight points is half of the two-point stroke.
    expect(revealEnds(strokes, 0.125)).toEqual([0.5, 0]);
    expect(revealEnds(strokes, 0.25)).toEqual([1, 0]);
    expect(revealEnds(strokes, 1)).toEqual([1, 1]);
  });

  it("clamps progress rather than over-drawing or reversing", () => {
    expect(revealEnds(strokes, 2)).toEqual([1, 1]);
    expect(revealEnds(strokes, -1)).toEqual([0, 0]);
  });

  it("spends budget by point count, so the pen's speed is even across strokes", () => {
    const [, second] = revealEnds(strokes, 0.5);
    expect(second).toBeCloseTo(1 / 3);
  });

  it("handles a drawing with no points", () => {
    expect(revealEnds([{ points: [] }], 0.5)).toEqual([0]);
  });
});

describe("staggerWindow", () => {
  it("offsets each element by one step and keeps every window the same length", () => {
    expect(staggerWindow(0, 0.1, 0.4, 0.08)).toEqual([0.1, 0.5]);
    const [from, to] = staggerWindow(3, 0.1, 0.4, 0.08);
    expect(from).toBeCloseTo(0.34);
    expect(to - from).toBeCloseTo(0.4);
  });

  it("wraps long lists so the last item does not wait for every one before it", () => {
    const [unwrapped] = staggerWindow(9, 0, 0.4, 0.1);
    const [wrapped] = staggerWindow(9, 0, 0.4, 0.1, 5);
    expect(unwrapped).toBeCloseTo(0.9);
    expect(wrapped).toBeCloseTo(0.4);
  });
});
