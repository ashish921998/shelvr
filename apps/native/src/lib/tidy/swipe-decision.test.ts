import { describe, expect, it } from "vitest";

import { swipeDecision } from "./swipe-decision";

// Thresholds mirror the runtime geometry: a quarter of the width and a fifth
// of the height of the test window (400×800).
const TX = 100;
const TY = 160;

describe("swipeDecision", () => {
  it("commits keep past the horizontal threshold with no velocity", () => {
    expect(swipeDecision(200, 0, 0, 0, TX, TY)).toBe("keep");
  });

  it("commits delete left of the threshold", () => {
    expect(swipeDecision(-200, 0, 0, 0, TX, TY)).toBe("delete");
  });

  it("commits save past the upward threshold", () => {
    expect(swipeDecision(0, -200, 0, 0, TX, TY)).toBe("save");
  });

  it("returns null under both thresholds", () => {
    expect(swipeDecision(50, -60, 0, 0, TX, TY)).toBeNull();
  });

  it("never commits a downward drag, even fast", () => {
    expect(swipeDecision(0, 400, 0, 0, TX, TY)).toBeNull();
    expect(swipeDecision(0, 400, 0, 2000, TX, TY)).toBeNull();
  });

  it("refuses a downward gesture carrying horizontal release noise", () => {
    // 300 pt/s projects to ~150 horizontal points, past thresholdX on its own.
    // The downward travel still dominates, so the photo stays unreviewed.
    expect(swipeDecision(0, 400, 300, 0, TX, TY)).toBeNull();
    expect(swipeDecision(0, 400, -300, 0, TX, TY)).toBeNull();
  });

  it("still commits sideways when a downward drift is the smaller axis", () => {
    expect(swipeDecision(250, 60, 0, 0, TX, TY)).toBe("keep");
  });

  it("commits a short flick through velocity projection", () => {
    // 30px of travel plus ~1000px of projected momentum clears the threshold.
    expect(swipeDecision(30, 0, 2000, 0, TX, TY)).toBe("keep");
  });

  it("lets upward velocity rescue a sub-threshold vertical pan", () => {
    expect(swipeDecision(0, -40, 0, -3000, TX, TY)).toBe("save");
  });

  it("keeps the horizontal axis dominant on a projected diagonal tie", () => {
    // Both projected axes cross; horizontal wins the tie.
    expect(swipeDecision(-250, -400, 0, 0, TX, TY)).toBe("delete");
  });

  it("prefers save when the projected upward axis dominates", () => {
    expect(swipeDecision(150, -400, 0, 0, TX, TY)).toBe("save");
  });
});
