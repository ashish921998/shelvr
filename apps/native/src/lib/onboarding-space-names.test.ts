import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { newConvexTest } from "@convex/test.setup";
import { api } from "@convex/_generated/api";
import {
  clearPending,
  getOnboardingProgress,
  getPendingSpaces,
  resolveOnboardingSpaceName,
  setOnboardingProgress,
  setPendingDemo,
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

it("reuses the demo space after a language change and persisted-step resume", async () => {
  const backend = newConvexTest();
  const owner = backend.withIdentity({ subject: "onboarding-owner|session" });
  setOnboardingProgress({
    q1: [],
    q2: ["Recipes"],
    spaces: ["Recipes"],
    step: 5,
  });
  const spaceName = resolveOnboardingSpaceName("Recipes");
  expect(spaceName).toBe("Recipes");
  const demo = await owner.mutation(api.demo.createDemoItem, {
    url: "https://example.com/recipe",
    spaceName,
  });
  setPendingDemo({ url: demo.url, destination: spaceName });
  setOnboardingProgress({
    q1: [],
    q2: ["Recipes"],
    spaces: ["Recipes"],
    step: 7,
  });
  setPendingDemo(null);

  device.locale = "de-DE";
  expect(onboardingLabel("Recipes")).toBe("Rezepte");
  const resumed = getOnboardingProgress();
  setPendingSpaces(resumed.spaces.map(resolveOnboardingSpaceName));
  const ids = await Promise.all(
    getPendingSpaces().map((name) =>
      owner.mutation(api.spaces.createSpace, { name, dynamic: true }),
    ),
  );
  const spaces = await backend.run((ctx) => ctx.db.query("spaces").collect());
  expect(spaces).toHaveLength(1);
  expect(ids).toEqual([spaces[0]._id]);
  const membership = await backend.run((ctx) =>
    ctx.db.query("spaceItems").first(),
  );
  expect(membership).toMatchObject({
    itemId: demo.itemId,
    spaceId: spaces[0]._id,
    status: "saved",
  });
});

it("reads old progress records and clears frozen names when onboarding is cleared", () => {
  device.storage.set(
    "shelvr.pending.onboarding",
    JSON.stringify({
      operationId: "old",
      spaces: ["Recipes"],
      demoUrl: null,
      step: 3,
    }),
  );
  expect(getOnboardingProgress().spaces).toEqual(["Recipes"]);
  expect(resolveOnboardingSpaceName("Recipes")).toBe("Recipes");
  clearPending();
  device.locale = "de-DE";
  expect(resolveOnboardingSpaceName("Recipes")).toBe("Rezepte");
});
