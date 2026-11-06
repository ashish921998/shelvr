import { describe, expect, it } from "vitest";

import { sketchPoints } from "./mapSketch";

const BOX = { width: 360, height: 240, padding: 22 };

const mexicoCity = [
  { lat: 19.419, lng: -99.166 },
  { lat: 19.348, lng: -99.162 },
  { lat: 19.42, lng: -99.161 },
  { lat: 19.418, lng: -99.164 },
];

function inside({ x, y }: { x: number; y: number }) {
  return (
    x >= BOX.padding &&
    x <= BOX.width - BOX.padding &&
    y >= BOX.padding &&
    y <= BOX.height - BOX.padding
  );
}

describe("sketchPoints", () => {
  it("keeps every point inside the padded box, in input order", () => {
    const points = sketchPoints(mexicoCity, BOX);
    expect(points).toHaveLength(mexicoCity.length);
    expect(points.every(inside)).toBe(true);
    const north = points[2];
    const south = points[1];
    expect(north.y).toBeLessThan(south.y);
  });

  it("fills the box with the framed places along their longer side", () => {
    const points = sketchPoints(mexicoCity, BOX);
    const ys = points.map((point) => point.y);
    expect(Math.min(...ys)).toBeCloseTo(BOX.padding);
    expect(Math.max(...ys)).toBeCloseTo(BOX.height - BOX.padding);
  });

  it("lets a far place change nothing for the others, and clamps it", () => {
    const near = sketchPoints(mexicoCity, BOX);
    const withFar = sketchPoints(
      [...mexicoCity, { lat: 20.6597, lng: -103.3496 }],
      BOX,
    );
    expect(withFar.slice(0, mexicoCity.length)).toEqual(near);
    const far = withFar[mexicoCity.length];
    expect(inside(far)).toBe(true);
    expect(far.x).toBe(BOX.padding);
  });

  it("centres a single place", () => {
    expect(sketchPoints([{ lat: 30.267, lng: -97.743 }], BOX)).toEqual([
      { x: 180, y: 120 },
    ]);
  });

  it("does not spread two places on one street to the corners", () => {
    const [a, b] = sketchPoints(
      [
        { lat: 30.2672, lng: -97.7431 },
        { lat: 30.2675, lng: -97.7426 },
      ],
      BOX,
    );
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(20);
    expect(inside(a) && inside(b)).toBe(true);
  });

  it("frames two places far apart edge to edge", () => {
    const [austin, dallas] = sketchPoints(
      [
        { lat: 30.267, lng: -97.743 },
        { lat: 32.777, lng: -96.797 },
      ],
      BOX,
    );
    expect(austin.y).toBeCloseTo(BOX.height - BOX.padding);
    expect(dallas.y).toBeCloseTo(BOX.padding);
  });

  it("returns nothing for no places", () => {
    expect(sketchPoints([], BOX)).toEqual([]);
  });
});
