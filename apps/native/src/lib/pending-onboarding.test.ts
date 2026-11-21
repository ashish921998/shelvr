import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearLegacyDemoUrl,
  clearPending,
  getOrCreatePendingOperationId,
  getPendingDemoOwner,
  getPendingDemoSpace,
  getPendingDemoUrl,
  getPendingSpaces,
  getPendingOperationId,
  hasPending,
  noteReplayDeclined,
  queueDemoUrl,
  replayDeclined,
  setPendingSpaces,
} from "./pending-onboarding";

const storage = vi.hoisted(() => new Map<string, string>());
vi.mock("expo-secure-store", () => ({
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
}));
vi.mock("expo-crypto", () => ({ randomUUID: () => "new-operation-id" }));

beforeEach(() => storage.clear());

describe("a no to the replay's paywall", () => {
  it("is kept for the work it was asked about, through the record's rewrites", () => {
    queueDemoUrl("https://example.com/reel");
    noteReplayDeclined(getPendingOperationId());
    expect(replayDeclined()).toBe(true);
    setPendingSpaces(["Recipes"]);
    clearLegacyDemoUrl();
    expect(replayDeclined()).toBe(true);
    clearPending();
    expect(replayDeclined()).toBe(false);
  });

  it("is ignored for other work, or when nothing is queued", () => {
    noteReplayDeclined("onboarding:gone");
    expect(replayDeclined()).toBe(false);
    queueDemoUrl("https://example.com/reel");
    noteReplayDeclined("onboarding:gone");
    noteReplayDeclined(null);
    expect(replayDeclined()).toBe(false);
  });
});

describe("onboarding recovery", () => {
  it("does not request a replay or paywall when storage is absent, cleared, or corrupt", () => {
    expect(hasPending()).toBe(false);
    setPendingSpaces(["Inspiration"]);
    expect(hasPending()).toBe(true);
    clearPending();
    expect(hasPending()).toBe(false);
    storage.set("shelvr.pending.onboarding", "{broken");
    expect(hasPending()).toBe(false);
  });

  it("retains an older queued link and its operation id when onboarding finishes again", () => {
    storage.set(
      "shelvr.pending.onboarding",
      JSON.stringify({
        operationId: "legacy-operation",
        spaces: ["Recipes"],
        demoUrl: "https://example.com",
      }),
    );
    setPendingSpaces(["Recipes", "Inspiration"]);
    expect(getPendingDemoUrl()).toBe("https://example.com");
    expect(getOrCreatePendingOperationId()).toBe("legacy-operation");
    expect(hasPending()).toBe(true);
  });
});

describe("a first save queued before sign-in", () => {
  it("waits for the replay and survives finishing onboarding", () => {
    queueDemoUrl("https://example.com/recipe");
    expect(hasPending()).toBe(true);
    setPendingSpaces([]);
    expect(getPendingDemoUrl()).toBe("https://example.com/recipe");
    expect(hasPending()).toBe(true);
  });

  it("keeps the space it was picked for until the link is cleared", () => {
    queueDemoUrl("https://example.com/recipe", "Recipes");
    setPendingSpaces(["Recipes"]);
    expect(getPendingDemoSpace()).toBe("Recipes");
    clearLegacyDemoUrl();
    expect(getPendingDemoSpace()).toBeNull();
  });

  it("keeps the account it belongs to until the link is cleared", () => {
    queueDemoUrl("https://example.com/recipe", "Recipes", "user-1");
    setPendingSpaces(["Recipes"]);
    expect(getPendingDemoOwner()).toBe("user-1");
    clearLegacyDemoUrl();
    expect(getPendingDemoOwner()).toBeNull();
  });
});

describe("a record written by an older onboarding flow", () => {
  it("still hands an older finished record's spaces to the replay", () => {
    storage.set(
      "shelvr.pending.onboarding",
      JSON.stringify({
        operationId: "legacy-operation",
        spaces: ["Recipes"],
        demoUrl: null,
        step: 7,
      }),
    );
    expect(hasPending()).toBe(true);
    expect(getPendingSpaces()).toEqual(["Recipes"]);
  });
});
