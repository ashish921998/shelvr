import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearLegacyDemoUrlIfSaved,
  clearPending,
  getOnboardingProgress,
  getOrCreatePendingOperationId,
  getPendingDemoUrl,
  hasPending,
  setOnboardingProgress,
  setPendingDemo,
  setPendingSpaces,
  updatePendingSpaces,
} from "./pending-onboarding";

const storage = vi.hoisted(() => new Map<string, string>());
vi.mock("expo-secure-store", () => ({
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
}));
vi.mock("expo-crypto", () => ({ randomUUID: () => "new-operation-id" }));

beforeEach(() => storage.clear());

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

  it("retains an older queued link and its operation id through partial replay", () => {
    storage.set(
      "shelvr.pending.onboarding",
      JSON.stringify({
        operationId: "legacy-operation",
        spaces: ["Recipes"],
        demoUrl: "https://example.com",
      }),
    );
    setPendingSpaces(["Recipes", "Inspiration"]);
    updatePendingSpaces([]);
    expect(getPendingDemoUrl()).toBe("https://example.com");
    expect(getOrCreatePendingOperationId()).toBe("legacy-operation");
    expect(hasPending()).toBe(true);
  });

  it("clears an older queued link only when that exact link was saved by the real demo", () => {
    storage.set(
      "shelvr.pending.onboarding",
      JSON.stringify({
        operationId: "legacy-operation",
        spaces: [],
        demoUrl: "https://example.com",
      }),
    );
    clearLegacyDemoUrlIfSaved("https://example.org/");
    expect(hasPending()).toBe(true);
    clearLegacyDemoUrlIfSaved("https://example.com/");
    expect(getPendingDemoUrl()).toBeNull();
    expect(hasPending()).toBe(false);
  });

  it("recovers the demo request and destination alongside survey and step progress", () => {
    setOnboardingProgress({
      q1: ["X bookmarks"],
      q2: ["Inspiration"],
      spaces: ["Inspiration"],
      step: 5,
    });
    setPendingDemo({
      url: "https://example.com/design",
      destination: "Inspiration",
    });
    setOnboardingProgress({
      q1: ["X bookmarks"],
      q2: ["Inspiration"],
      spaces: ["Inspiration"],
      step: 6,
    });
    expect(getOnboardingProgress()).toEqual({
      q1: ["X bookmarks"],
      q2: ["Inspiration"],
      spaces: ["Inspiration"],
      step: 6,
      demo: { url: "https://example.com/design", destination: "Inspiration" },
    });
    setPendingDemo(null);
    expect(getOnboardingProgress().demo).toBeNull();
    expect(getOnboardingProgress().spaces).toEqual(["Inspiration"]);
  });

  it("drops a completed demo when onboarding finishes, even with no spaces picked", () => {
    setOnboardingProgress({ q1: [], q2: [], spaces: [], step: 5 });
    setPendingDemo({ url: "https://example.com/design", destination: null });
    setOnboardingProgress({ q1: [], q2: [], spaces: [], step: 7 });
    // finish(): nothing for the replay hook to do, and no stale save left in
    // SecureStore that a later mount could replay.
    setPendingSpaces([]);
    expect(getOnboardingProgress().demo).toBeNull();
    expect(hasPending()).toBe(false);
  });

  it("keeps the in-flight demo through a partial replay update but not through finish", () => {
    setPendingDemo({
      url: "https://example.com/design",
      destination: "Inspiration",
    });
    updatePendingSpaces(["Recipes"]);
    expect(getOnboardingProgress().demo).toEqual({
      url: "https://example.com/design",
      destination: "Inspiration",
    });
    setPendingSpaces(["Recipes"]);
    expect(getOnboardingProgress().demo).toBeNull();
    expect(getOnboardingProgress().spaces).toEqual(["Recipes"]);
    expect(hasPending()).toBe(true);
  });
});
