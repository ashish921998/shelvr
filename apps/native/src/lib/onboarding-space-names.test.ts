import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  clearPending,
  getOnboardingProgress,
  getPendingSpaces,
  resolveOnboardingSpaceName,
  setOnboardingProgress,
  setPendingSpaces,
} from "@/lib/pending-onboarding";
import { onboardingLabel } from "@/lib/onboarding-labels";

const device = vi.hoisted(() => ({
  locale: "en-US",
  storage: new Map<string, string>(),
}));
vi.mock("expo-secure-store", () => ({
  getItem: (key: string) => device.storage.get(key) ?? null,
  setItem: (key: string, value: string) => device.storage.set(key, value),
}));
vi.mock("expo-crypto", () => ({ randomUUID: () => "onboarding-test" }));
vi.mock("expo-localization", () => ({
  getLocales: () => [{ languageTag: device.locale }],
}));

beforeEach(() => {
  device.locale = "en-US";
  device.storage.clear();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});
afterEach(() => vi.useRealTimers());

it("names the picked topics' spaces in the language onboarding finishes in", () => {
  setOnboardingProgress({ spaces: ["Food & recipes"], step: 1 });

  device.locale = "de-DE";
  const resumed = getOnboardingProgress();
  setPendingSpaces(resumed.spaces.map(resolveOnboardingSpaceName));
  expect(getPendingSpaces()).toEqual([onboardingLabel("Food & recipes")]);
  expect(getPendingSpaces()).not.toEqual(["Food & recipes"]);
});

it("keeps an old record's frozen names but not its progress, and clears them with onboarding", () => {
  device.storage.set(
    "shelvr.pending.onboarding",
    JSON.stringify({
      operationId: "old",
      spaces: ["Recipes"],
      demoUrl: null,
      step: 3,
    }),
  );
  expect(getOnboardingProgress().spaces).toEqual([]);
  expect(resolveOnboardingSpaceName("Recipes")).toBe("Recipes");
  device.locale = "de-DE";
  expect(resolveOnboardingSpaceName("Recipes")).toBe("Recipes");
  clearPending();
  expect(resolveOnboardingSpaceName("Recipes")).toBe("Rezepte");
});
