import { describe, expect, it } from "vitest";

import { swipeDecision, swipeProgress } from "./swipe-decision";

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
    expect(swipeDecision(0, 400, 3000, 0, TX, TY)).toBeNull();
    expect(swipeDecision(0, 400, -3000, 0, TX, TY)).toBeNull();
  });

  it("ignores a reversal on the axis that lost the gesture", () => {
    expect(swipeDecision(250, 4, 0, -300, TX, TY)).toBe("keep");
    expect(swipeDecision(5, -300, -200, -1500, TX, TY)).toBe("save");
  });

  it("still commits sideways when a downward drift is the smaller axis", () => {
    expect(swipeDecision(250, 60, 0, 0, TX, TY)).toBe("keep");
  });

  it("commits a short flick through velocity projection", () => {
    expect(swipeDecision(30, 0, 2000, 0, TX, TY)).toBe("keep");
  });

  it("refuses a pull-back released at the origin", () => {
    expect(swipeDecision(0, 0, -500, 0, TX, TY)).toBeNull();
    expect(swipeDecision(0, 0, 500, 0, TX, TY)).toBeNull();
  });

  it("refuses momentum that carries a parked card across rest", () => {
    expect(swipeDecision(150, 0, -6000, 0, TX, TY)).toBeNull();
  });

  it("lets momentum extend a drag in its own direction", () => {
    expect(swipeDecision(-250, 0, -2000, 0, TX, TY)).toBe("delete");
  });

  it("keeps a parked card when a late velocity blip never crosses rest", () => {
    expect(swipeDecision(230, 0, -800, 0, TX, TY)).toBe("keep");
  });

  it("lets upward velocity rescue a sub-threshold vertical pan", () => {
    expect(swipeDecision(0, -40, 0, -3000, TX, TY)).toBe("save");
  });

  it("keeps the horizontal axis dominant on a projected diagonal tie", () => {
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
