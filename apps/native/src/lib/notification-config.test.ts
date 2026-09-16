import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const configUrl = new URL("../../app.config.js", import.meta.url);
const source = readFileSync(configUrl, "utf8");
const requireConfig = createRequire(configUrl);

function validate(
  variant: string,
  platform: string,
  file?: string,
  packages: string[] = [],
) {
  const module = {
    exports: (_input: { config: object }) => ({
      android: { googleServicesFile: undefined as string | undefined },
    }),
  };
  runInNewContext(source, {
    module,
    require: (id: string) =>
      id === "node:fs"
        ? {
            readFileSync: () =>
              JSON.stringify({
                project_info: { project_number: "12345" },
                client: packages.map((packageName) => ({
                  client_info: {
                    android_client_info: { package_name: packageName },
                    mobilesdk_app_id: "test-app-id",
                  },
                  api_key: [{ current_key: "test-client-key" }],
                })),
              }),
          }
        : requireConfig(id),
    process: {
      env: {
        EAS_BUILD: "true",
        EAS_BUILD_PLATFORM: platform,
        APP_VARIANT: variant,
        EXPO_PUBLIC_REVENUECAT_TEST_KEY: "test_VOYicTvOGPXCBFMVdHzyxRndiRi",
        EXPO_PUBLIC_REVENUECAT_ANDROID_KEY: "goog_store",
        EXPO_PUBLIC_REVENUECAT_IOS_KEY: "appl_store",
        EXPO_PUBLIC_CONVEX_URL:
          variant === "production"
            ? "https://amiable-setter-120.convex.cloud"
            : "https://amicable-antelope-639.convex.cloud",
        GOOGLE_SERVICES_JSON: file,
      },
    },
    URL,
  });
  return module.exports({ config: {} });
}

describe("Firebase build configuration", () => {
  it.each(["development", "preview", "production"])(
    "requires Firebase for Android %s builds",
    (variant) => {
      expect(() => validate(variant, "android")).toThrow(
        /require GOOGLE_SERVICES_JSON/,
      );
    },
  );

  it.each([
    ["development", "app.shelvr.save.dev"],
    ["preview", "app.shelvr.save.preview"],
    ["production", "app.shelvr.save"],
  ])("accepts the matching Firebase client for %s", (variant, packageName) => {
    expect(
      validate(variant, "android", "/tmp/firebase.json", [packageName]).android
        .googleServicesFile,
    ).toBe("/tmp/firebase.json");
  });

  it("rejects a production-only Firebase file in a preview build", () => {
    expect(() =>
      validate("preview", "android", "/tmp/firebase.json", ["app.shelvr.save"]),
    ).toThrow(/Firebase client for app.shelvr.save.preview/);
  });

  it.each(["development", "preview", "production"])(
    "does not require Firebase for iOS %s",
    (variant) => {
      expect(() => validate(variant, "ios")).not.toThrow();
    },
  );
});
