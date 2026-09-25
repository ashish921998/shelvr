// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  APP_STORE_ID,
  APP_STORE_URL,
  appStoreUrl,
  arrivalCampaign,
  sanitizeCampaign,
} from "./appStore";

describe("App Store link", () => {
  beforeEach(() => window.sessionStorage.clear());
  afterEach(() => vi.unstubAllEnvs());

  it("uses the configured App Store identifier", () => {
    expect(APP_STORE_ID).toBe("6798143550");
    expect(APP_STORE_URL).toBe("https://apps.apple.com/app/id6798143550");
  });

  it("stays plain without a provider token", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_STORE_PROVIDER_TOKEN", "");
    expect(appStoreUrl("web_hero")).toBe(APP_STORE_URL);
  });

  it("carries the provider token and campaign when configured", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_STORE_PROVIDER_TOKEN", "123456");
    expect(appStoreUrl("web_hero")).toBe(
      `${APP_STORE_URL}?pt=123456&ct=web_hero&mt=8`,
    );
  });

  it("reduces a campaign to safe characters within Apple's limit", () => {
    expect(sanitizeCampaign(" TikTok Jane! ")).toBe("tiktok_jane");
    expect(sanitizeCampaign("x".repeat(60))).toHaveLength(40);
    expect(sanitizeCampaign("!!!")).toBeUndefined();
  });

  it("keeps the arrival campaign for the rest of the visit", () => {
    expect(arrivalCampaign("?utm_campaign=creator_jane")).toBe("creator_jane");
    expect(arrivalCampaign("")).toBe("creator_jane");
    expect(arrivalCampaign("?ct=meta_test_1")).toBe("meta_test_1");
  });

  it("falls back to utm_campaign when ct is empty or unusable", () => {
    expect(arrivalCampaign("?ct=&utm_campaign=creator_jane")).toBe(
      "creator_jane",
    );
    expect(arrivalCampaign("?ct=!!!&utm_campaign=creator_ann")).toBe(
      "creator_ann",
    );
  });

  it("has no campaign for a direct visit", () => {
    expect(arrivalCampaign("")).toBeUndefined();
  });
});
