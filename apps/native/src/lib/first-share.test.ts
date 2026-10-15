import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  dismissSaveProgressCard,
  finishWeeklyNudge,
  hasSavedFirstShare,
  isFirstSession,
  isSaveProgressCardDismissed,
  isWeeklyNudgePending,
  recordShareSaved,
  shouldOfferWeeklyNudge,
  shouldShowHowTo,
} from "./first-share";

const store = vi.hoisted(() => new Map<string, string>());
vi.mock("@/lib/analytics", () => ({ analytics: { captureError: vi.fn() } }));
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

describe("weekly nudge timing", () => {
  beforeEach(() => store.clear());

  it("treats the launch that first sees an account as its first session", () => {
    expect(isFirstSession("user_a")).toBe(true);
    // Same launch, asked again.
    expect(isFirstSession("user_a")).toBe(true);
    // A later launch stored a different id first.
    store.set("shelvr.firstLaunch.user_b", "an-earlier-launch");
    expect(isFirstSession("user_b")).toBe(false);
  });

  it("waits for three real saves outside the first session", () => {
    const three = { saved: 3, goal: 3 };
    const base = { firstSession: false, progress: three };
    expect(shouldOfferWeeklyNudge(base)).toBe(true);
    expect(shouldOfferWeeklyNudge({ ...base, firstSession: true })).toBe(false);
    expect(
      shouldOfferWeeklyNudge({ ...base, progress: { saved: 2, goal: 3 } }),
    ).toBe(false);
    expect(shouldOfferWeeklyNudge({ ...base, progress: undefined })).toBe(
      false,
    );
  });

  it("remembers a dismissed progress card per account", () => {
    dismissSaveProgressCard("user_a");
    expect(isSaveProgressCardDismissed("user_a")).toBe(true);
    expect(isSaveProgressCardDismissed("user_b")).toBe(false);
  });
});
