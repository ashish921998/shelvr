import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextSaveGoalStep, progressTitleKey, trackSaveGoal } from "./save-goal";

const mock = vi.hoisted(() => ({
  store: new Map<string, string>(),
  capture: vi.fn(),
}));
vi.mock("@/lib/analytics", () => ({
  analytics: { capture: mock.capture, captureError: vi.fn() },
}));
vi.mock("expo-secure-store", () => ({
  getItem: (key: string) => mock.store.get(key) ?? null,
  setItem: (key: string, value: string) => {
    mock.store.set(key, value);
  },
}));

const HOUR = 60 * 60 * 1000;
const goal = 3;

describe("nextSaveGoalStep", () => {
  it("starts the clock the first time the shelf is short of the goal", () => {
    expect(nextSaveGoalStep(null, { saved: 0, goal }, 1000)).toEqual({
      kind: "start",
      at: 1000,
    });
    expect(nextSaveGoalStep("1000", { saved: 2, goal }, 5000)).toEqual({
      kind: "none",
    });
  });

  it("reports the hours from that first sighting to the goal", () => {
    expect(
      nextSaveGoalStep("0", { saved: 3, goal }, 30 * HOUR + HOUR / 4),
    ).toEqual({ kind: "reached", hoursSinceStart: 30.25 });
  });

  it("never rounds a save past 48 hours down to 48", () => {
    const step = nextSaveGoalStep(
      "0",
      { saved: 3, goal },
      48 * HOUR + 2 * 60 * 1000,
    );
    expect(step).toEqual({ kind: "reached", hoursSinceStart: 48.04 });
  });

  it("waits for the card itself before starting the clock", () => {
    expect(nextSaveGoalStep(null, { saved: 0, goal }, 1000, false)).toEqual({
      kind: "none",
    });
  });

  it("skips a shelf that was already full when first seen", () => {
    expect(nextSaveGoalStep(null, { saved: 3, goal }, 0)).toEqual({
      kind: "skip",
    });
  });

  it("does nothing once done, even if saves drop below the goal", () => {
    expect(nextSaveGoalStep("done", { saved: 1, goal }, 0)).toEqual({
      kind: "none",
    });
  });
});

describe("trackSaveGoal", () => {
  beforeEach(() => {
    mock.store.clear();
    mock.capture.mockClear();
  });

  it("fires save_goal_reached once per account", () => {
    trackSaveGoal(
      "user_a",
      { saved: 0, goal },
      { cardDismissed: false, cardVisible: true },
      0,
    );
    trackSaveGoal(
      "user_a",
      { saved: 2, goal },
      { cardDismissed: false, cardVisible: true },
      HOUR,
    );
    trackSaveGoal(
      "user_a",
      { saved: 3, goal },
      { cardDismissed: true, cardVisible: true },
      20 * HOUR,
    );
    trackSaveGoal(
      "user_a",
      { saved: 3, goal },
      { cardDismissed: true, cardVisible: true },
      21 * HOUR,
    );
    expect(mock.capture).toHaveBeenCalledTimes(1);
    expect(mock.capture).toHaveBeenCalledWith("save_goal_reached", {
      goal,
      hours_since_start: 20,
      card_dismissed: true,
    });
  });

  it("never fires for an existing shelf or another account's clock", () => {
    trackSaveGoal(
      "user_a",
      { saved: 0, goal },
      { cardDismissed: false, cardVisible: true },
      0,
    );
    trackSaveGoal(
      "user_b",
      { saved: 3, goal },
      { cardDismissed: false, cardVisible: true },
      0,
    );
    trackSaveGoal(
      "user_b",
      { saved: 3, goal },
      { cardDismissed: false, cardVisible: true },
      1,
    );
    expect(mock.capture).not.toHaveBeenCalled();
  });
});

describe("progressTitleKey", () => {
  it("counts down the saves still to go", () => {
    expect(progressTitleKey(0, 3)).toBe("home.progressTitleFirst");
    expect(progressTitleKey(1, 3)).toBe("home.progressTitleNext");
    expect(progressTitleKey(2, 3)).toBe("home.progressTitleLast");
  });
});
