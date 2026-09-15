import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const configUrl = new URL("../../app.config.js", import.meta.url);
const source = readFileSync(configUrl, "utf8");
const requireConfig = createRequire(configUrl);
const productionUrl = "https://amiable-setter-120.convex.cloud";
const testKey = "test_VOYicTvOGPXCBFMVdHzyxRndiRi";

function validate(env: Record<string, string>) {
  runInNewContext(source, {
    require: requireConfig,
    module: { exports: {} },
    process: { env },
    URL,
  });
}

describe("billing environment isolation", () => {
  it.each(["/", "?test=true", "/?test=true", "/#test"])(
    "rejects production origin with suffix %s",
    (suffix) => {
      expect(() =>
        validate({
          APP_VARIANT: "preview",
          EXPO_PUBLIC_CONVEX_URL: productionUrl + suffix,
        }),
      ).toThrow(/must not use production Convex/);
    },
  );
  it.each(["development", "preview"])(
    "rejects production Convex in %s",
    (variant) => {
      expect(() =>
        validate({
          APP_VARIANT: variant,
          EXPO_PUBLIC_CONVEX_URL: productionUrl,
        }),
      ).toThrow(/must not use production Convex/);
    },
  );

  it("rejects the old production-project Test Store key", () => {
    expect(() =>
      validate({
        EXPO_PUBLIC_REVENUECAT_TEST_KEY: "test_DzhYgoqsrxPykbPmjFpAMFbGBwn",
      }),
    ).toThrow(/Shelvr Development/);
  });

  it("requires the isolated test key in a development build", () => {
    expect(() =>
      validate({ EAS_BUILD: "true", APP_VARIANT: "development" }),
    ).toThrow(/Shelvr Development/);
  });

  it("accepts the development backend and isolated Test Store", () => {
    expect(() =>
      validate({
        EAS_BUILD: "true",
        EXPO_PUBLIC_CONVEX_URL: "https://amicable-antelope-639.convex.cloud",
        EXPO_PUBLIC_REVENUECAT_TEST_KEY: testKey,
      }),
    ).not.toThrow();
  });

  it("rejects a Test Store key in a production build", () => {
    expect(() =>
      validate({
        EAS_BUILD: "true",
        APP_VARIANT: "production",
        EXPO_PUBLIC_REVENUECAT_IOS_KEY: testKey,
      }),
    ).toThrow(/appl_/);
  });

  it("rejects a development backend in a production build", () => {
    expect(() =>
      validate({
        EAS_BUILD: "true",
        APP_VARIANT: "production",
        EAS_BUILD_PLATFORM: "android",
        EXPO_PUBLIC_REVENUECAT_ANDROID_KEY: "goog_store",
        EXPO_PUBLIC_CONVEX_URL: "https://amicable-antelope-639.convex.cloud",
        GOOGLE_SERVICES_JSON: "/tmp/google-services.json",
      }),
    ).toThrow(/production deployment URL/);
  });

  it("requires Firebase client configuration in a production Android build", () => {
    expect(() =>
      validate({
        EAS_BUILD: "true",
        APP_VARIANT: "production",
        EAS_BUILD_PLATFORM: "android",
        EXPO_PUBLIC_REVENUECAT_ANDROID_KEY: "goog_store",
        EXPO_PUBLIC_CONVEX_URL: productionUrl,
      }),
    ).toThrow(/GOOGLE_SERVICES_JSON/);
  });
});
