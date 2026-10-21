import { afterEach, describe, expect, it, vi } from "vitest";

import { APP_STORE_URL } from "./appStore";
import {
  bioAction,
  bioAppStoreUrl,
  chromeIntentUrl,
  inAppBrowser,
  isIPadDesktop,
  platform,
  playStoreUrl,
} from "./bioLink";

const UA = {
  iosSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  iosInstagram:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.0 (iPhone15,2; iOS 18_0; en_US)",
  iosTikTok:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 musical_ly_36.0.0 JsSdk/2.0 NetType/WIFI Channel/App Store ByteLocale/en Region/US",
  androidTikTok:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0 Mobile Safari/537.36 trill_360000 BytedanceWebview/d8a21c6",
  androidInstagram:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0 Mobile Safari/537.36 Instagram 350.0.0.0 Android",
  androidChrome:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36",
  iosFacebook:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/480.0]",
  desktop:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
};

describe("bio link detection", () => {
  it("names the social app's in-app browser", () => {
    expect(inAppBrowser(UA.iosInstagram)).toBe("instagram");
    expect(inAppBrowser(UA.androidInstagram)).toBe("instagram");
    expect(inAppBrowser(UA.iosTikTok)).toBe("tiktok");
    expect(inAppBrowser(UA.androidTikTok)).toBe("tiktok");
    expect(inAppBrowser(UA.iosFacebook)).toBe("facebook");
  });

  it("leaves real browsers alone", () => {
    expect(inAppBrowser(UA.iosSafari)).toBeUndefined();
    expect(inAppBrowser(UA.androidChrome)).toBeUndefined();
    expect(inAppBrowser(UA.desktop)).toBeUndefined();
  });

  it("tells iPhone from Android from everything else", () => {
    expect(platform(UA.iosTikTok)).toBe("ios");
    expect(platform(UA.androidChrome)).toBe("android");
    expect(platform(UA.desktop)).toBe("other");
  });
});

describe("iPad in desktop mode", () => {
  it("is a Mac user agent with a touch screen", () => {
    expect(isIPadDesktop(UA.desktop, 5)).toBe(true);
    expect(isIPadDesktop(UA.desktop, 0)).toBe(false);
    expect(isIPadDesktop(UA.androidChrome, 5)).toBe(false);
  });
});

describe("bio link action", () => {
  it("sends iPhone browsers straight to the App Store", () => {
    expect(bioAction(undefined, "ios")).toBe("app_store");
  });

  it("asks iPhone in-app browsers to open a real browser", () => {
    expect(bioAction("tiktok", "ios")).toBe("overlay");
    expect(bioAction("instagram", "ios")).toBe("overlay");
  });

  it("keeps Android on the waitlist page until Play is live", () => {
    expect(bioAction(undefined, "android", false)).toBe("stay");
    expect(bioAction("tiktok", "android", false)).toBe("stay");
  });

  it("sends Android on to Play once it is live", () => {
    expect(bioAction(undefined, "android", true)).toBe("play_store");
    expect(bioAction("instagram", "android", true)).toBe("overlay");
  });

  it("never redirects a desktop visitor", () => {
    expect(bioAction(undefined, "other", true)).toBe("stay");
    expect(bioAction("facebook", "other", true)).toBe("stay");
  });
});

describe("bio link URLs", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("opens the default product page until a custom one is set", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_STORE_PROVIDER_TOKEN", "");
    expect(bioAppStoreUrl("tokyo")).toBe(APP_STORE_URL);
  });

  it("adds the custom product page and keeps the campaign", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_STORE_PROVIDER_TOKEN", "123456");
    expect(bioAppStoreUrl("tokyo", "abc-123")).toBe(
      `${APP_STORE_URL}?pt=123456&ct=tokyo&mt=8&ppid=abc-123`,
    );
  });

  it("tags the Play listing with the campaign as the install referrer", () => {
    expect(playStoreUrl("tokyo")).toBe(
      "https://play.google.com/store/apps/details?id=app.shelvr.save&referrer=utm_campaign%3Dtokyo",
    );
    expect(playStoreUrl(undefined)).toBe(
      "https://play.google.com/store/apps/details?id=app.shelvr.save",
    );
  });

  it("reopens the same page in Chrome, falling back to it marked as tried", () => {
    const intent = chromeIntentUrl(
      "https://shelvr-web.vercel.app/get?ct=tokyo",
    );
    expect(intent).toBe(
      `intent://shelvr-web.vercel.app/get?ct=tokyo#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(
        "https://shelvr-web.vercel.app/get?ct=tokyo&chrome=0",
      )};end`,
    );
  });
});
