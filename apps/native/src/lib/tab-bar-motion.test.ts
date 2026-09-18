import { describe, expect, it } from "vitest";
import {
  RUBBER_BAND_LIMIT,
  isDarkColor,
  overflowPast,
  rubberBand,
  tabIndexAt,
  tabSlotX,
  withAlpha,
} from "./tab-bar-motion";

describe("rubberBand", () => {
  it("does not move the pill until the finger leaves it", () => {
    expect(rubberBand(0, RUBBER_BAND_LIMIT)).toBe(0);
  });

  it("keeps the direction of the pull and resists it more the further it goes", () => {
    const near = rubberBand(8, RUBBER_BAND_LIMIT);
    const far = rubberBand(80, RUBBER_BAND_LIMIT);
    expect(near).toBeGreaterThan(0);
    expect(rubberBand(-8, RUBBER_BAND_LIMIT)).toBeCloseTo(-near);
    // The first pixels track the finger closely; later ones barely register.
    expect(near / 8).toBeGreaterThan(far / 80);
  });

  it("never reaches the limit however far the finger drags", () => {
    const pulled = rubberBand(10_000, RUBBER_BAND_LIMIT);
    expect(pulled).toBeLessThan(RUBBER_BAND_LIMIT);
    expect(pulled).toBeGreaterThan(RUBBER_BAND_LIMIT * 0.99);
  });
});

describe("overflowPast", () => {
  it("is zero inside the bounds and signed outside them", () => {
    expect(overflowPast(40, 100)).toBe(0);
    expect(overflowPast(-12, 100)).toBe(-12);
    expect(overflowPast(130, 100)).toBe(30);
  });
});

describe("tabIndexAt", () => {
  // A 216pt pill with 8pt padding leaves four 50pt slots.
  const hit = (x: number) => tabIndexAt(x, 216, 4, 8);

  it("maps each slot to its tab", () => {
    expect([33, 83, 133, 183].map(hit)).toEqual([0, 1, 2, 3]);
  });

  it("treats the padding as part of the nearest tab", () => {
    expect(hit(2)).toBe(0);
    expect(hit(214)).toBe(3);
  });

  it("reports no tab once the finger leaves the pill", () => {
    expect(hit(-1)).toBe(-1);
    expect(hit(217)).toBe(-1);
  });

  it("stays within range at the exact right edge", () => {
    expect(hit(216)).toBe(3);
  });
});

describe("tabSlotX", () => {
  it("places whole and in-between indices along the pill", () => {
    expect(tabSlotX(0, 216, 4, 8)).toBe(8);
    expect(tabSlotX(3, 216, 4, 8)).toBe(158);
    // Halfway through a spring from tab 1 to tab 2.
    expect(tabSlotX(1.5, 216, 4, 8)).toBe(83);
  });
});

describe("colour helpers", () => {
  it("converts a hex theme colour to rgba", () => {
    expect(withAlpha("#e6a23c", 0.25)).toBe("rgba(230, 162, 60, 0.25)");
    expect(withAlpha("not-a-colour", 0.5)).toBe("not-a-colour");
  });

  it("tells the light and dark app backgrounds apart", () => {
    expect(isDarkColor("#faf6ee")).toBe(false);
    expect(isDarkColor("#191510")).toBe(true);
    expect(isDarkColor("#111417")).toBe(true);
  });
});
