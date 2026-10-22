import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearLegacyDemoUrl,
  clearPending,
  getOnboardingProgress,
  getOrCreatePendingOperationId,
  getPendingDemoOwner,
  getPendingDemoSpace,
  getPendingDemoUrl,
  getPendingSpaces,
  hasPending,
  queueDemoUrl,
  setOnboardingProgress,
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

  it("recovers the picked topics and step", () => {
    setOnboardingProgress({ spaces: ["Travel"], step: 2 });
    expect(getOnboardingProgress()).toEqual({
      spaces: ["Travel"],
      step: 2,
      travelCity: null,
      goal: null,
    });
  });
});

describe("the sample trip's city", () => {
  it("is kept with the progress through a relaunch", () => {
    setOnboardingProgress({ spaces: ["Travel"], step: 2, travelCity: "tokyo" });
    expect(getOnboardingProgress().travelCity).toBe("tokyo");
  });

  it("reads back as none when the record holds no city", () => {
    setOnboardingProgress({ spaces: [], step: 1 });
    expect(getOnboardingProgress().travelCity).toBeNull();
  });

  it("reads back as none when the stored city is not a sample city", () => {
    setOnboardingProgress({ spaces: ["Travel"], step: 2, travelCity: "tokyo" });
    const stored = JSON.parse(storage.get("shelvr.pending.onboarding") ?? "{}");
    storage.set(
      "shelvr.pending.onboarding",
      JSON.stringify({ ...stored, travelCity: "atlantis" }),
    );
    expect(getOnboardingProgress().travelCity).toBeNull();
  });
});

describe("the goal", () => {
  it("is kept with the progress through a relaunch", () => {
    setOnboardingProgress({ spaces: ["Date nights"], step: 2, goal: "date" });
    expect(getOnboardingProgress().goal).toBe("date");
  });

  it("reads back as none when the stored goal is not one onboarding asks", () => {
    setOnboardingProgress({ spaces: [], step: 1, goal: "food" });
    const stored = JSON.parse(storage.get("shelvr.pending.onboarding") ?? "{}");
    storage.set(
      "shelvr.pending.onboarding",
      JSON.stringify({ ...stored, goal: "shopping" }),
    );
    expect(getOnboardingProgress().goal).toBeNull();
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

  it("keeps the onboarding progress beside it", () => {
    setOnboardingProgress({ spaces: ["a"], step: 3 });
    queueDemoUrl("https://example.com/recipe");
    expect(getOnboardingProgress()).toMatchObject({ spaces: ["a"], step: 3 });
  });
});

describe("progress written by an older onboarding flow", () => {
  const fresh = { spaces: [], step: null, travelCity: null, goal: null };

  it.each([0, 1, 2, 3, 4, 5, 6, 7])(
    "restarts a record at old step %i with fresh progress",
    (step) => {
      storage.set(
        "shelvr.pending.onboarding",
        JSON.stringify({
          operationId: "legacy-operation",
          spaces: ["Recipes"],
          demoUrl: null,
          q1: ["X bookmarks"],
          q2: ["Recipes"],
          step,
          demo: { url: "https://example.com/recipe", destination: "Recipes" },
        }),
      );
      expect(getOnboardingProgress()).toEqual(fresh);
    },
  );

  it.each([
    ["no version", {}],
    ["an unknown version", { progressVersion: 1 }],
    ["the flow before the source step", { progressVersion: 2 }],
    ["the flow that had the source step", { progressVersion: 3 }],
    ["the flow before the interests step", { progressVersion: 4 }],
    ["the flow that had the reveal step", { progressVersion: 5 }],
    ["the flow that had the first save", { progressVersion: 6 }],
    ["the flow that asked topics first", { progressVersion: 7 }],
    ["a non-numeric version", { progressVersion: "2" }],
  ])("restarts a record with %s", (_name, version) => {
    storage.set(
      "shelvr.pending.onboarding",
      JSON.stringify({
        operationId: "op",
        spaces: ["Travel"],
        demoUrl: null,
        saveKinds: ["Travel"],
        step: 2,
        ...version,
      }),
    );
    expect(getOnboardingProgress()).toEqual(fresh);
  });

  it("restores a record written by the current flow", () => {
    storage.set(
      "shelvr.pending.onboarding",
      JSON.stringify({
        operationId: "op",
        spaces: ["Travel"],
        demoUrl: null,
        progressVersion: 8,
        step: 2,
        spaceNames: {},
      }),
    );
    expect(getOnboardingProgress()).toEqual({
      spaces: ["Travel"],
      step: 2,
      travelCity: null,
      goal: null,
    });
  });

  it("keeps the replay fields once the new flow writes progress", () => {
    storage.set(
      "shelvr.pending.onboarding",
      JSON.stringify({
        operationId: "legacy-operation",
        spaces: ["Recipes"],
        demoUrl: "https://example.com/queued",
        step: 5,
        demo: { url: "https://example.com/recipe", destination: "Recipes" },
      }),
    );
    setOnboardingProgress({ spaces: [], step: 0 });
    expect(getOnboardingProgress()).toEqual({
      spaces: [],
      step: 0,
      travelCity: null,
      goal: null,
    });
    expect(getPendingDemoUrl()).toBe("https://example.com/queued");
    expect(getOrCreatePendingOperationId()).toBe("legacy-operation");
  });

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
