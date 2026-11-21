import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  clearHandoff,
  finishHandoff,
  type OnboardingAnswers,
} from "@/lib/onboarding-handoff";
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
vi.mock("@/lib/analytics", () => ({ analytics: { captureError: vi.fn() } }));

const KEY = "shelvr.pending.onboarding";

const dateNight: OnboardingAnswers = {
  goals: ["date"],
  travelCity: null,
  beenCities: [],
  savedCount: null,
  skippedShare: true,
};

function storedSpaces(): unknown {
  return (JSON.parse(device.storage.get(KEY) ?? "{}") as { spaces?: unknown })
    .spaces;
}

beforeEach(() => {
  device.locale = "en-US";
  device.storage.clear();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});
afterEach(() => vi.useRealTimers());

it("names the picked goals' spaces in the language onboarding finishes in", () => {
  device.locale = "de-DE";
  finishHandoff(dateNight, null);
  expect(storedSpaces()).toEqual([onboardingLabel("Date nights")]);
  expect(storedSpaces()).not.toEqual(["Date nights"]);
});

it("keeps an old record's frozen names, and clears them with onboarding", () => {
  device.storage.set(
    KEY,
    JSON.stringify({
      operationId: "old",
      spaces: [],
      demoUrl: null,
      step: 3,
      spaceNames: { "Date nights": "Date nights" },
    }),
  );
  device.locale = "de-DE";
  finishHandoff(dateNight, null);
  expect(storedSpaces()).toEqual(["Date nights"]);
  clearHandoff();
  finishHandoff(dateNight, null);
  expect(storedSpaces()).toEqual(["Date-Abende"]);
});
