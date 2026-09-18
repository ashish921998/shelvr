import { describe, expect, it } from "vitest";

import { APP_STORE_ID, APP_STORE_URL } from "./appStore";

describe("App Store link", () => {
  it("uses the configured App Store identifier", () => {
    expect(APP_STORE_ID).toBe("6798143550");
    expect(APP_STORE_URL).toBe("https://apps.apple.com/app/id6798143550");
  });
});
