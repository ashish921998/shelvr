import { afterEach, describe, expect, it, vi } from "vitest";

import {
  appLinkScheme,
  creatorMapLink,
  saveAllHint,
  saveAllLabel,
  saveAllMode,
} from "./creatorMap";

const TOKEN = "0123456789abcdef0123456789abcdef";
const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("appLinkScheme", () => {
  it("links to the store app unless a known scheme is set", () => {
    vi.stubEnv("APP_LINK_SCHEME", undefined);
    expect(appLinkScheme()).toBe("shelvr");
    vi.stubEnv("APP_LINK_SCHEME", "evil");
    expect(appLinkScheme()).toBe("shelvr");
    vi.stubEnv("APP_LINK_SCHEME", "javascript");
    expect(appLinkScheme()).toBe("shelvr");
  });

  it("takes the development and preview schemes", () => {
    vi.stubEnv("APP_LINK_SCHEME", "shelvr-dev");
    expect(appLinkScheme()).toBe("shelvr-dev");
    vi.stubEnv("APP_LINK_SCHEME", "shelvr-preview");
    expect(appLinkScheme()).toBe("shelvr-preview");
  });
});

describe("creatorMapLink", () => {
  it("names the page and the city with no host or path, both encoded", () => {
    expect(creatorMapLink("shelvr", TOKEN, "São Paulo")).toBe(
      `shelvr:///?creatorMap=${TOKEN}&city=S%C3%A3o%20Paulo`,
    );
    expect(creatorMapLink("shelvr-dev", "a&b c", "Mexico City")).toBe(
      "shelvr-dev:///?creatorMap=a%26b%20c&city=Mexico%20City",
    );
  });
});

describe("saveAllLabel", () => {
  it("says Save all for one city and names each city otherwise", () => {
    expect(saveAllLabel("Mexico City", 1)).toBe("Save all to Shelvr");
    expect(saveAllLabel("Mexico City", 2)).toBe("Save Mexico City to Shelvr");
    expect(saveAllLabel("Austin", 2)).toBe("Save Austin to Shelvr");
  });
});

describe("saveAllHint", () => {
  it("sends in-app browser visitors to their real browser first", () => {
    expect(saveAllHint("instagram", 1)).toBe(
      "In Instagram, tap ••• up top, then Open in browser, and tap Save all there.",
    );
    expect(saveAllHint("tiktok", 1)).toBe(
      "In TikTok, tap ••• up top, then Open in browser, and tap Save all there.",
    );
    expect(saveAllHint("facebook", 1)).toBe(
      "In Facebook, tap ••• up top, then Open in browser, and tap Save all there.",
    );
  });

  it("tells everyone else to install, come back, or update", () => {
    expect(saveAllHint(undefined, 1)).toBe(
      "New to Shelvr? Install it, then come back to this page and tap Save all. If Shelvr opens on Home instead, update it from the App Store.",
    );
  });

  it("names the city buttons, not Save all, when each city has its own", () => {
    expect(saveAllHint(undefined, 2)).toBe(
      "New to Shelvr? Install it, then come back to this page and tap your city’s button. If Shelvr opens on Home instead, update it from the App Store.",
    );
    expect(saveAllHint("instagram", 2)).toBe(
      "In Instagram, tap ••• up top, then Open in browser, and tap your city’s button there.",
    );
  });
});

describe("saveAllMode", () => {
  it("offers the app on an iPhone, in Safari or an in-app browser", () => {
    expect(saveAllMode(IPHONE)).toBe("app");
    expect(saveAllMode(`${IPHONE} Instagram 350.0.0.0.0`)).toBe("app");
  });

  it("shows nothing on Android, where there is no app yet", () => {
    expect(saveAllMode("Mozilla/5.0 (Linux; Android 14; Pixel 8)")).toBe(
      "none",
    );
  });

  it("asks computers to open the page on an iPhone", () => {
    expect(
      saveAllMode(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
      ),
    ).toBe("elsewhere");
    expect(
      saveAllMode(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      ),
    ).toBe("elsewhere");
    expect(saveAllMode("")).toBe("elsewhere");
  });
});
