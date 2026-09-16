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
    expect(hasSavedFirstShare()).toBe(false);
    expect(isWeeklyNudgePending()).toBe(false);
    recordShareSaved();
    expect(hasSavedFirstShare()).toBe(true);
    expect(isWeeklyNudgePending()).toBe(true);
  });

  it("does not queue the nudge again once it was answered", () => {
    recordShareSaved();
    finishWeeklyNudge();
    expect(isWeeklyNudgePending()).toBe(false);
    recordShareSaved();
    expect(isWeeklyNudgePending()).toBe(false);
    expect(store.get("shelvr.weeklyNudge")).toBe("done");
  });

  it("queues the nudge when the stored value was cleared", () => {
    store.set("shelvr.weeklyNudge", "");
    recordShareSaved();
    expect(isWeeklyNudgePending()).toBe(true);
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
