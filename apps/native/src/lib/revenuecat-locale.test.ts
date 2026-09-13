import { beforeEach, expect, it, vi } from "vitest";
import { revenueCatLocale, syncRevenueCatUILocale } from "./revenuecat-locale";

const device = vi.hoisted(() => ({ tag: "fr-FR", captureError: vi.fn() }));
vi.mock("expo-localization", () => ({
  getLocales: () => [{ languageTag: device.tag }],
}));
vi.mock("./analytics", () => ({
  analytics: { captureError: device.captureError },
}));
beforeEach(() => {
  device.tag = "fr-FR";
  vi.clearAllMocks();
});

it.each([
  ["fr-FR", "fr-FR"],
  ["fr-CA", "fr-CA"],
  ["de-AT", "de-DE"],
  ["es-MX", "es-MX"],
  ["ja-JP", "ja-JP"],
  ["ko-KR", "ko-KR"],
  ["pt-BR", "pt-BR"],
  ["hi-IN", "en-US"],
  ["ar-SA", "en-US"],
])("uses app locale %s as RevenueCat UI locale %s", (tag, expected) => {
  device.tag = tag;
  expect(revenueCatLocale()).toBe(expected);
});

it("reads the latest language before each purchase UI presentation", async () => {
  const sdk = { overridePreferredLocale: vi.fn().mockResolvedValue(undefined) };
  expect(await syncRevenueCatUILocale(sdk)).toBe(true);
  device.tag = "ja-JP";
  expect(await syncRevenueCatUILocale(sdk)).toBe(true);
  expect(sdk.overridePreferredLocale.mock.calls).toEqual([
    ["fr-FR"],
    ["ja-JP"],
  ]);
});

it("reports a locale failure and prevents presentation with a stale locale", async () => {
  const error = new Error("native locale unavailable");
  expect(
    await syncRevenueCatUILocale({
      overridePreferredLocale: vi.fn().mockRejectedValue(error),
    }),
  ).toBe(false);
  expect(device.captureError).toHaveBeenCalledWith(
    "purchase_ui_locale_sync_failed",
    error,
  );
  expect(await syncRevenueCatUILocale(null)).toBe(false);
});
