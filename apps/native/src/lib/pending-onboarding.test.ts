import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearLegacyDemoUrlIfSaved,
  clearPending,
  getOnboardingProgress,
  getOrCreatePendingOperationId,
  getPendingDemoUrl,
  getPendingSpaces,
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

  it("recovers the demo request and destination alongside kind and step progress", () => {
    setOnboardingProgress({
      saveKinds: ["Inspiration"],
      spaces: ["Inspiration"],
      step: 2,
    });
    setPendingDemo({
      url: "https://example.com/design",
      destination: "Inspiration",
      viaShare: true,
    });
    setOnboardingProgress({
      saveKinds: ["Inspiration"],
      spaces: ["Inspiration"],
      step: 3,
    });
    expect(getOnboardingProgress()).toEqual({
      saveKinds: ["Inspiration"],
      spaces: ["Inspiration"],
      step: 3,
      demo: {
        url: "https://example.com/design",
        destination: "Inspiration",
        viaShare: true,
      },
    });
    setPendingDemo(null);
    expect(getOnboardingProgress().demo).toBeNull();
    expect(getOnboardingProgress().spaces).toEqual(["Inspiration"]);
  });

  it("drops a completed demo when onboarding finishes, even with no spaces picked", () => {
    setOnboardingProgress({ saveKinds: [], spaces: [], step: 2 });
    setPendingDemo({
      url: "https://example.com/design",
      destination: null,
      viaShare: false,
    });
    setOnboardingProgress({ saveKinds: [], spaces: [], step: 3 });
    // finish(): nothing for the replay hook to do, and no stale save left in
    // SecureStore that a later mount could replay.
    setPendingSpaces([]);
    expect(getOnboardingProgress().demo).toBeNull();
    expect(hasPending()).toBe(false);
  });

  it("keeps the in-flight demo through a partial replay update but not through finish", () => {
    setOnboardingProgress({ saveKinds: [], spaces: [], step: 2 });
    setPendingDemo({
      url: "https://example.com/design",
      destination: "Inspiration",
      viaShare: true,
    });
    updatePendingSpaces(["Recipes"]);
    expect(getOnboardingProgress().demo).toEqual({
      url: "https://example.com/design",
      destination: "Inspiration",
      viaShare: true,
    });
    setPendingSpaces(["Recipes"]);
    expect(getOnboardingProgress().demo).toBeNull();
    expect(getOnboardingProgress().spaces).toEqual(["Recipes"]);
    expect(hasPending()).toBe(true);
  });
});

describe("progress written by an older onboarding flow", () => {
  const fresh = { saveKinds: [], spaces: [], step: null, demo: null };

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
        progressVersion: 2,
        saveKinds: ["Travel"],
        step: 2,
        demo: {
          url: "https://example.com/trip",
          destination: null,
          viaShare: true,
        },
        spaceNames: {},
      }),
    );
    expect(getOnboardingProgress()).toEqual({
      saveKinds: ["Travel"],
      spaces: ["Travel"],
      step: 2,
      demo: {
        url: "https://example.com/trip",
        destination: null,
        viaShare: true,
      },
    });
  });

  it("reads a demo written before viaShare existed as not shared", () => {
    storage.set(
      "shelvr.pending.onboarding",
      JSON.stringify({
        operationId: "op",
        spaces: ["Travel"],
        demoUrl: null,
        progressVersion: 2,
        saveKinds: ["Travel"],
        step: 2,
        // An older build wrote no viaShare. Defaulting it to false keeps the
        // Home how-to card rather than hiding it from a user who never shared.
        demo: { url: "https://example.com/trip", destination: null },
        spaceNames: {},
      }),
    );
    expect(getOnboardingProgress().demo).toEqual({
      url: "https://example.com/trip",
      destination: null,
      viaShare: false,
    });
  });

  it("keeps the replay fields but not the old demo once the new flow writes progress", () => {
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
    setOnboardingProgress({ saveKinds: [], spaces: [], step: 0 });
    expect(getOnboardingProgress()).toEqual({
      saveKinds: [],
      spaces: [],
      step: 0,
      demo: null,
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
