import { describe, expect, it } from "vitest";
import { cardSize, cardTilt, dropDelay } from "./shelf-layout";

describe("cardSize", () => {
  it("gives a shelf a skyline: a portrait save stands taller and narrower than a landscape one", () => {
    const portrait = cardSize(0.66);
    const landscape = cardSize(1.78);
    expect(portrait.height).toBeGreaterThan(landscape.height);
    expect(portrait.width).toBeLessThan(landscape.width);
  });

  it("falls back to a square for a save with no usable aspect ratio", () => {
    const square = cardSize(1);
    for (const value of [
      undefined,
      0,
      -2,
      Number.NaN,
      Number.POSITIVE_INFINITY,
    ]) {
      expect(cardSize(value), String(value)).toEqual(square);
    }
  });

  it("keeps every card within the spec's 72–116 by 80–118 range", () => {
    for (const ratio of [0.5, 0.75, 1, 1.5, 2.4]) {
      const { width, height } = cardSize(ratio);
      expect(width).toBeGreaterThanOrEqual(72);
      expect(width).toBeLessThanOrEqual(116);
      expect(height).toBeGreaterThanOrEqual(80);
      expect(height).toBeLessThanOrEqual(118);
    }
  });
});

describe("cardTilt", () => {
  it("leans no further than a degree and a half either way", () => {
    for (let seed = 0; seed < 30; seed++) {
      expect(Math.abs(cardTilt(seed))).toBeLessThanOrEqual(1.5);
    }
  });

  it("is fixed per card, so a row does not reshuffle as it re-renders", () => {
    expect(cardTilt(4)).toBe(cardTilt(4));
    expect(cardTilt(4)).not.toBe(cardTilt(5));
  });

  it("leans both ways across a row", () => {
    const tilts = Array.from({ length: 8 }, (_, i) => cardTilt(i));
    expect(tilts.some((v) => v > 0)).toBe(true);
    expect(tilts.some((v) => v < 0)).toBe(true);
  });
});

describe("dropDelay", () => {
  it("drops the first card immediately and staggers the rest", () => {
    expect(dropDelay(0)).toBe(0);
    expect(dropDelay(1)).toBeGreaterThan(0);
    expect(dropDelay(2)).toBeGreaterThan(dropDelay(1));
  });

  it("keeps each gap inside the spec's 80–150ms", () => {
    for (let i = 1; i < 10; i++) {
      const gap = dropDelay(i) - dropDelay(i - 1);
      expect(gap).toBeGreaterThanOrEqual(80);
      expect(gap).toBeLessThanOrEqual(150);
    }
  });
});
