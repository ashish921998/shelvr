import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const configUrl = new URL("../../app.config.js", import.meta.url);
const source = readFileSync(configUrl, "utf8");
const requireConfig = createRequire(configUrl);

function validate(variant: string, platform: string) {
  const module = {
    exports: (_input: { config: object }) => ({ android: {} }),
  };
  runInNewContext(source, {
    module,
    require: requireConfig,
    process: {
      env: {
        EAS_BUILD: "true",
        EAS_BUILD_PLATFORM: platform,
        APP_VARIANT: variant,
        EXPO_PUBLIC_REVENUECAT_TEST_KEY: "test_VOYicTvOGPXCBFMVdHzyxRndiRi",
        EXPO_PUBLIC_REVENUECAT_ANDROID_KEY: "goog_store",
        EXPO_PUBLIC_REVENUECAT_IOS_KEY: "appl_store",
        // A production Android config refuses to build without the maps key.
        GOOGLE_MAPS_API_KEY: "maps_key",
        EXPO_PUBLIC_CONVEX_URL:
          variant === "production"
            ? "https://amiable-setter-120.convex.cloud"
            : "https://amicable-antelope-639.convex.cloud",
      },
    },
    URL,
  });
  return module.exports({ config: {} });
}

describe("Firebase build configuration", () => {
  it.each(["development", "preview", "production"])(
    "does not expose the Firebase file in %s Android config",
    (variant) => {
      expect(validate(variant, "android").android).not.toHaveProperty(
        "googleServicesFile",
      );
    },
  );

  it.each(["development", "preview", "production"])(
    "does not require Firebase for iOS %s",
    (variant) => {
      expect(() => validate(variant, "ios")).not.toThrow();
    },
  );
});
