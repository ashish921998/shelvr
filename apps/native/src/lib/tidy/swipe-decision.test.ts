import { describe, expect, it } from "vitest";

import { swipeDecision, swipeProgress } from "./swipe-decision";

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
    // 3000 pt/s projects to 150 horizontal points, past thresholdX on its own.
    // The downward travel still dominates, so the photo stays unreviewed.
    expect(swipeDecision(0, 400, 3000, 0, TX, TY)).toBeNull();
    expect(swipeDecision(0, 400, -3000, 0, TX, TY)).toBeNull();
  });

  it("ignores a reversal on the axis that lost the gesture", () => {
    // A sideways drag carries a few points of vertical drift. Upward release
    // velocity flips that drift across rest, but horizontal owns the gesture,
    // so the reversal is noise on a losing axis and keep still commits.
    expect(swipeDecision(250, 4, 0, -300, TX, TY)).toBe("keep");
    // The same shape with the axes swapped: a save whose small horizontal
    // drift reverses at lift.
    expect(swipeDecision(5, -300, -200, -1500, TX, TY)).toBe("save");
  });

  it("still commits sideways when a downward drift is the smaller axis", () => {
    expect(swipeDecision(250, 60, 0, 0, TX, TY)).toBe("keep");
  });

  it("commits a short flick through velocity projection", () => {
    // 30px of travel plus the projected momentum (0.05s × 2000 pt/s = 100px)
    // clears the threshold.
    expect(swipeDecision(30, 0, 2000, 0, TX, TY)).toBe("keep");
  });

  it("refuses a pull-back released at the origin", () => {
    // Drag past a threshold, yank back to center, and lift while the finger
    // still pulls away: with ~0.5s of coast a 500 pt/s pull-back projected
    // ~250px and committed the opposite action; 0.05s leaves 25px, far short.
    expect(swipeDecision(0, 0, -500, 0, TX, TY)).toBeNull();
    expect(swipeDecision(0, 0, 500, 0, TX, TY)).toBeNull();
  });

  it("refuses momentum that carries a parked card across rest", () => {
    // 150px parked right (Keep lit) with a hard leftward release flings the
    // projection to the far side of the origin: the direction guard refuses.
    expect(swipeDecision(150, 0, -6000, 0, TX, TY)).toBeNull();
  });

  it("lets momentum extend a drag in its own direction", () => {
    // A leftward drag released still moving left commits delete: momentum
    // agrees with the parked offset instead of opposing it.
    expect(swipeDecision(-250, 0, -2000, 0, TX, TY)).toBe("delete");
  });

  it("keeps a parked card when a late velocity blip never crosses rest", () => {
    // 230px right is long past the threshold; a small opposing velocity at
    // lift shrinks the projection but never flips it across the origin.
    expect(swipeDecision(230, 0, -800, 0, TX, TY)).toBe("keep");
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

describe("swipeProgress", () => {
  it("tracks the dominant axis toward its action, unclamped", () => {
    expect(swipeProgress(150, 0, TX, TY)).toEqual({
      action: "keep",
      progress: 1.5,
    });
    expect(swipeProgress(-150, 0, TX, TY)).toEqual({
      action: "delete",
      progress: 1.5,
    });
    expect(swipeProgress(0, -240, TX, TY)).toEqual({
      action: "save",
      progress: 1.5,
    });
  });

  it("scores a downward-dominant drag as zero even past the side threshold", () => {
    // 150px right clears thresholdX on its own, but 400px down dominates:
    // the drag heads nowhere, so every cue reads zero.
    expect(swipeProgress(150, 400, TX, TY)).toEqual({
      action: null,
      progress: 0,
    });
  });

  it("breaks an exact diagonal tie toward the horizontal action", () => {
    expect(swipeProgress(100, -160, TX, TY)).toEqual({
      action: "keep",
      progress: 1,
    });
  });
});
