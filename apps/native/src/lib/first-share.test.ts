import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  finishWeeklyNudge,
  hasSavedFirstShare,
  isWeeklyNudgePending,
  recordShareSaved,
  shouldShowHowTo,
} from "./first-share";

const store = vi.hoisted(() => new Map<string, string>());
vi.mock("expo-secure-store", () => ({
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => {
    store.set(key, value);
  },
}));

describe("first share-sheet save", () => {
  beforeEach(() => store.clear());

  it("marks the first save and queues the weekly nudge", () => {
    expect(hasSavedFirstShare("user_a")).toBe(false);
    expect(isWeeklyNudgePending("user_a")).toBe(false);
    recordShareSaved("user_a");
    expect(hasSavedFirstShare("user_a")).toBe(true);
    expect(isWeeklyNudgePending("user_a")).toBe(true);
  });

  it("keeps each account's state separate", () => {
    recordShareSaved("user_a");
    finishWeeklyNudge("user_a");
    expect(hasSavedFirstShare("user_b")).toBe(false);
    expect(isWeeklyNudgePending("user_b")).toBe(false);
    recordShareSaved("user_b");
    expect(isWeeklyNudgePending("user_b")).toBe(true);
    expect(isWeeklyNudgePending("user_a")).toBe(false);
  });

  it("does not queue the nudge again once it was answered", () => {
    recordShareSaved("user_a");
    finishWeeklyNudge("user_a");
    expect(isWeeklyNudgePending("user_a")).toBe(false);
    recordShareSaved("user_a");
    expect(isWeeklyNudgePending("user_a")).toBe(false);
    expect(store.get("shelvr.weeklyNudge.user_a")).toBe("done");
  });

  it("queues the nudge when the stored value was cleared", () => {
    store.set("shelvr.weeklyNudge.user_a", "");
    recordShareSaved("user_a");
    expect(isWeeklyNudgePending("user_a")).toBe(true);
  });
});

describe("shouldShowHowTo", () => {
  it.each([
    [false, 0, true],
    [false, 1, true],
    [false, 2, false],
    [true, 0, false],
    [true, 1, false],
  ])(
    "firstShareSaved=%s with %i items shows the how-to: %s",
    (firstShareSaved, itemCount, expected) => {
      expect(shouldShowHowTo({ firstShareSaved, itemCount })).toBe(expected);
    },
  );
});
