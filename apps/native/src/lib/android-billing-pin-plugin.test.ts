import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const requirePlugin = createRequire(
  new URL("../../plugins/with-android-billing-pin.js", import.meta.url),
);
const plugin = requirePlugin("./with-android-billing-pin.js");

describe("Android Play Billing pin", () => {
  it("forces the Billing version RevenueCat is built against", () => {
    const out = plugin.addBillingPin("android {\n}\n");
    expect(out).toContain(
      "resolutionStrategy.force 'com.android.billingclient:billing:8.3.0'",
    );
    expect(out.startsWith("android {\n}\n")).toBe(true);
  });

  it("is idempotent across prebuilds", () => {
    const once = plugin.addBillingPin("android {\n}\n");
    expect(plugin.addBillingPin(once)).toBe(once);
  });

  it("refuses a Kotlin build script it cannot edit", async () => {
    const config = plugin({}) as {
      mods: { android: { appBuildGradle: (m: unknown) => Promise<unknown> } };
    };
    await expect(
      config.mods.android.appBuildGradle({
        modResults: { language: "kt", contents: "" },
      }),
    ).rejects.toThrow(/must be Groovy/);
  });
});
