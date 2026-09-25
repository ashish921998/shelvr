import { describe, expect, it } from "vitest";
import {
  arc,
  bezier,
  ease,
  handEllipse,
  hairlinePoints,
  quad,
  runnerSlice,
  span,
  stitchSegments,
  wobble,
  WOBBLE,
  type Point,
} from "./geometry";

describe("span", () => {
  it("clamps outside its window so a canvas holds still before and after its turn", () => {
    expect(span(0.2, 0.5, 1)).toBe(0);
    expect(span(2, 0.5, 1)).toBe(1);
    expect(span(0.75, 0.5, 1)).toBeCloseTo(0.5);
  });

  it("treats a zero-width window as a switch rather than dividing by zero", () => {
    expect(span(0.4, 0.5, 0.5)).toBe(0);
    expect(span(0.5, 0.5, 0.5)).toBe(1);
  });
});

describe("ease", () => {
  it("starts and ends at rest and passes through the midpoint", () => {
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    expect(ease(0.5)).toBeCloseTo(0.5);
  });
});

describe("wobble", () => {
  it("is deterministic for a seed, so a stroke never jitters between frames", () => {
    const pts: Point[] = [
      [0, 0],
      [10, 0],
      [20, 0],
    ];
    expect(wobble(pts, WOBBLE.line, 3)).toEqual(wobble(pts, WOBBLE.line, 3));
  });

  it("separates two elements that would otherwise wobble identically", () => {
    const pts: Point[] = [
      [0, 0],
      [10, 0],
      [20, 0],
    ];
    expect(wobble(pts, WOBBLE.line, 0)).not.toEqual(
      wobble(pts, WOBBLE.line, 1),
    );
  });

  it("stays within the preset's amplitude, so a stroke stays legible", () => {
    const pts: Point[] = Array.from({ length: 40 }, (_, i) => [i, 0] as Point);
    wobble(pts, WOBBLE.line, 2).forEach(([x, y], i) => {
      expect(Math.abs(x - pts[i][0])).toBeLessThanOrEqual(
        WOBBLE.line.ax + 1e-9,
      );
      expect(Math.abs(y - pts[i][1])).toBeLessThanOrEqual(
        WOBBLE.line.ay + 1e-9,
      );
    });
  });
});

describe("curves", () => {
  it("samples a cubic through its endpoints", () => {
    const pts = bezier([0, 0], [0, 10], [10, 10], [10, 0], 20);
    expect(pts).toHaveLength(21);
    expect(pts[0]).toEqual([0, 0]);
    expect(pts[20][0]).toBeCloseTo(10);
    expect(pts[20][1]).toBeCloseTo(0);
  });

  it("samples a quadratic through its endpoints", () => {
    const pts = quad([0, 0], [5, 10], [10, 0], 10);
    expect(pts[0]).toEqual([0, 0]);
    expect(pts[10][0]).toBeCloseTo(10);
  });

  it("draws an ellipse when given a second radius", () => {
    const pts = arc(0, 0, 10, 0, Math.PI * 2, 8, 4);
    expect(Math.max(...pts.map(([x]) => Math.abs(x)))).toBeCloseTo(10);
    expect(Math.max(...pts.map(([, y]) => Math.abs(y)))).toBeCloseTo(4);
  });
});

describe("hairlinePoints", () => {
  it("spans the canvas inside its inset and stays on the centre line at both ends", () => {
    const pts = hairlinePoints(390, 16);
    expect(pts[0]).toEqual([16, 8]);
    expect(pts[pts.length - 1][0]).toBeCloseTo(374);
    expect(pts[pts.length - 1][1]).toBeCloseTo(8);
  });
});

describe("handEllipse", () => {
  it("overshoots its start so the ring closes a little off, like a real pen", () => {
    const pts = handEllipse(0, 0, 10, 10, 0, 64);
    expect(pts.length).toBeGreaterThan(65);
    const [firstX, firstY] = pts[0];
    const [lastX, lastY] = pts[pts.length - 1];
    expect(Math.hypot(lastX - firstX, lastY - firstY)).toBeGreaterThan(0.5);
  });
});

describe("stitchSegments", () => {
  it("lays 6-on 4-off dashes and reveals them left to right", () => {
    const full = stitchSegments(0, 100, 5, 1);
    expect(full[0].to[0] - full[0].from[0]).toBeCloseTo(6);
    expect(full[1].from[0] - full[0].from[0]).toBeCloseTo(10);
    expect(stitchSegments(0, 100, 5, 0.5).length).toBeLessThan(full.length);
    expect(stitchSegments(0, 100, 5, 0)).toEqual([]);
  });

  it("clips the dash that the reveal lands inside rather than drawing it whole", () => {
    const partial = stitchSegments(0, 100, 5, 0.23);
    const last = partial[partial.length - 1];
    expect(last.to[0]).toBeLessThanOrEqual(23.0001);
  });
});

describe("runnerSlice", () => {
  it("returns a moving window whose head leads its tail", () => {
    const path: Point[] = Array.from(
      { length: 100 },
      (_, i) => [i, 0] as Point,
    );
    const early = runnerSlice(path, 0.2);
    const late = runnerSlice(path, 0.8);
    expect(early).not.toBeNull();
    expect(late).not.toBeNull();
    expect(late![0][0]).toBeGreaterThan(early![0][0]);
  });

  it("starts as a short stub rather than a full line", () => {
    const path: Point[] = Array.from(
      { length: 100 },
      (_, i) => [i, 0] as Point,
    );
    expect(runnerSlice(path, 0)).toHaveLength(2);
  });

  it("draws nothing for a path too short to stroke", () => {
    expect(runnerSlice([], 0.5)).toBeNull();
    expect(runnerSlice([[0, 0]], 0.5)).toBeNull();
  });

  it("never starts before the path does", () => {
    const short: Point[] = [
      [0, 0],
      [1, 0],
    ];
    expect(runnerSlice(short, 0.5)).toEqual(short);
  });
});
