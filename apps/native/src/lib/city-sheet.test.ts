import { describe, expect, it } from "vitest";
import { settleSheet, sheetSnaps, stepSheet } from "./city-sheet";

const snaps = sheetSnaps({
  height: 874,
  insetTop: 62,
  insetBottom: 34,
  middle: 326,
});

describe("sheetSnaps", () => {
  it("rests under the back button, at the map's share, and above the plan buttons", () => {
    expect(snaps).toEqual({ expanded: 114, middle: 326, collapsed: 650 });
  });

  it("keeps the middle between the other two on a short screen", () => {
    const short = sheetSnaps({
      height: 400,
      insetTop: 20,
      insetBottom: 0,
      middle: 300,
    });
    expect(short.middle).toBeLessThanOrEqual(short.collapsed);
    expect(short.middle).toBeGreaterThanOrEqual(short.expanded);
  });
});

describe("settleSheet", () => {
  it("rests where a slow drag lets go", () => {
    expect(settleSheet(140, 0, snaps)).toBe(114);
    expect(settleSheet(360, 0, snaps)).toBe(326);
    expect(settleSheet(600, 0, snaps)).toBe(650);
  });

  it("follows a flick past the nearest rest point", () => {
    expect(settleSheet(340, 1800, snaps)).toBe(650);
    expect(settleSheet(320, -1800, snaps)).toBe(114);
  });
});

describe("stepSheet", () => {
  it("moves one rest point at a time and stops at the ends", () => {
    expect(stepSheet(326, -1, snaps)).toBe(114);
    expect(stepSheet(326, 1, snaps)).toBe(650);
    expect(stepSheet(114, -1, snaps)).toBe(114);
    expect(stepSheet(650, 1, snaps)).toBe(650);
  });
});
