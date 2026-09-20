const appConfig = require("./app.json");
const { readFileSync } = require("node:fs");
const localizationConfig = require("./localization.config.json");
const supportedLocales = [
  ...new Set(Object.values(localizationConfig.storeLocales)),
].sort();
const supportsRTL = supportedLocales.some((locale) =>
  ["ar", "he", "ur"].includes(locale.split("-")[0]),
);

const BASE_ID = "app.shelvr.save";

// APP_VARIANT is set per EAS build profile (see eas.json). When unset — i.e. a
// local `expo start` / `expo run` — we fall back to "development" so a simulator
// install never collides with a production App Store install.
const variant = process.env.APP_VARIANT ?? "development";

const idSuffix =
  variant === "production" ? "" : variant === "preview" ? ".preview" : ".dev";
const bundleId = BASE_ID + idSuffix;

// Non-production installs share a distinct icon so dev/preview builds are
// unmistakable on the home screen next to the App Store build.
const isProduction = variant === "production";
const isDevelopment = !isProduction && variant !== "preview";

// Values are passed explicitly (never read via process.env[name]) so the
// expo/no-dynamic-env-var lint rule stays satisfied.
function requireProductionValue(name, value, isValid, expected) {
  if (isProduction && process.env.EAS_BUILD === "true" && !isValid(value)) {
    throw new Error(`Production config requires ${name} (${expected}).`);
  }
}

// Fail the build before an invalid public SDK key can reach App Review. Builds
// 14 and 16 presented RevenueCat Error 23 during Apple's sandbox purchase flow;
// the rejected build artifact contained a different key from the current
// RevenueCat App Store app. Keep this as a permanent release guardrail.
const buildPlatform = process.env.EAS_BUILD_PLATFORM;
const productionConvexUrl = "https://amiable-setter-120.convex.cloud";
const developmentTestKey = "test_VOYicTvOGPXCBFMVdHzyxRndiRi";
if (!isProduction) {
  let convexOrigin;
  try {
    convexOrigin = new URL(process.env.EXPO_PUBLIC_CONVEX_URL).origin;
  } catch {
    // Missing or malformed URLs are handled by the client configuration.
  }
  if (convexOrigin === productionConvexUrl) {
    throw new Error(
      "Development and preview builds must not use production Convex.",
    );
  }
  const testKey = process.env.EXPO_PUBLIC_REVENUECAT_TEST_KEY;
  if (
    (testKey || process.env.EAS_BUILD === "true") &&
    testKey !== developmentTestKey
  ) {
    throw new Error(
      "Development and preview builds require the Shelvr Development Test Store key.",
    );
  }
}
if (buildPlatform !== "android") {
  requireProductionValue(
    "EXPO_PUBLIC_REVENUECAT_IOS_KEY",
    process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
    (value) => value?.startsWith("appl_"),
    "an appl_ App Store public SDK key",
  );
}
if (buildPlatform === "android") {
  requireProductionValue(
    "EXPO_PUBLIC_REVENUECAT_ANDROID_KEY",
    process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
    (value) => value?.startsWith("goog_"),
    "a goog_ Google Play public SDK key",
  );
}
// The production Convex URL must parse as https:// with a hostname — a bare
// prefix check would let `https://` (no host) reach a store build.
requireProductionValue(
  "EXPO_PUBLIC_CONVEX_URL",
  process.env.EXPO_PUBLIC_CONVEX_URL,
  (value) => {
    if (!value) return false;
    try {
      const url = new URL(value);
      return url.origin === productionConvexUrl && url.pathname === "/";
    } catch {
      return false;
    }
  },
  "the Shelvr production deployment URL",
);

function displayName(base) {
  if (isProduction) return base;
  if (variant === "preview") return `${base} (Preview)`;
  return `${base} (Dev)`;
}

const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;
const googleServicesFile = process.env.GOOGLE_SERVICES_JSON;
// Every Android variant needs its own matching Firebase client. Validate on
// the EAS worker, where secret file variables are available, before compiling.
if (buildPlatform === "android" && process.env.EAS_BUILD === "true") {
  if (!googleServicesFile) {
    throw new Error("Android builds require GOOGLE_SERVICES_JSON.");
  }
  let firebase;
  try {
    firebase = JSON.parse(readFileSync(googleServicesFile, "utf8"));
  } catch {
    throw new Error(
      "GOOGLE_SERVICES_JSON must be a readable Firebase JSON file.",
    );
  }
  if (
    !firebase?.project_info?.project_number ||
    !firebase?.client?.some(
      (client) =>
        client.client_info?.android_client_info?.package_name === bundleId &&
        client.client_info?.mobilesdk_app_id &&
        client.api_key?.some((key) => key.current_key),
    )
  ) {
    throw new Error(
      `GOOGLE_SERVICES_JSON requires a Firebase client for ${bundleId}.`,
    );
  }
}
const requestedAndroidBuildArchs = (process.env.ANDROID_BUILD_ARCHS ?? "")
  .split(",")
  .map((arch) => arch.trim())
  .filter(Boolean);

module.exports = ({ config }) => ({
  ...appConfig.expo,
  ...config,
  name: displayName(appConfig.expo.name ?? "Shelvr"),
  icon: isProduction ? appConfig.expo.icon : "./assets/icon-dev.png",
  ios: {
    ...appConfig.expo.ios,
    ...config?.ios,
    icon: isProduction ? appConfig.expo.ios?.icon : "./assets/icon-dev.png",
    infoPlist: {
      ...appConfig.expo.ios?.infoPlist,
      ...config?.ios?.infoPlist,
      ...(isProduction
        ? {
            NSAppTransportSecurity: {
              NSAllowsArbitraryLoads: false,
              NSAllowsLocalNetworking: false,
            },
          }
        : {}),
    },
    bundleIdentifier: bundleId,
  },
  android: {
    ...appConfig.expo.android,
    ...config?.android,
    icon: isProduction ? appConfig.expo.android?.icon : undefined,
    adaptiveIcon: isProduction
      ? appConfig.expo.android?.adaptiveIcon
      : {
          ...appConfig.expo.android?.adaptiveIcon,
          foregroundImage: "./assets/icon-dev.png",
        },
    ...(googleMapsApiKey
      ? { config: { googleMaps: { apiKey: googleMapsApiKey } } }
      : {}),
    ...(googleServicesFile ? { googleServicesFile } : {}),
    package: bundleId,
  },
  locales: Object.fromEntries(
    supportedLocales.map((locale) => [locale, `./locales/${locale}.json`]),
  ),
  plugins: [
    // Xcode mods run in reverse registration order; attach strings after Widgets creates its target.
    "./plugins/with-widget-localization",
    ["expo-localization", { supportedLocales, supportsRTL }],
    // Keep the static plugins from app.json — an inline array here would
    // silently replace them (expo-font, expo-router, expo-sharing, …).
    ...(appConfig.expo.plugins ?? []),
    [
      "expo-build-properties",
      {
        android: {
          // Store builds only need physical-device ABIs. Skipping emulator
          // architectures keeps native C++ compilation within EAS limits.
          buildArchs:
            requestedAndroidBuildArchs.length > 0
              ? requestedAndroidBuildArchs
              : isProduction
                ? ["arm64-v8a", "armeabi-v7a"]
                : ["arm64-v8a", "armeabi-v7a", "x86", "x86_64"],
        },
      },
    ],
    [
      "expo-dev-client",
      {
        // The generated scheme lets a development client (app.shelvr.save.dev)
        // open dev-tool deep links without clashing with the production scheme.
        addGeneratedScheme: isDevelopment,
      },
    ],
    [
      "expo-widgets",
      {
        groupIdentifier: "group.app.shelvr.save",
        widgets: [
          {
            name: "RecentSaves",
            displayName: "Recent Saves",
            description: "Your latest saves, at a glance.",
            supportedFamilies: ["systemSmall", "systemMedium"],
            contentMarginsDisabled: true,
          },
        ],
      },
    ],
  ],
  extra: {
    ...appConfig.expo.extra,
    ...config?.extra,
    variant,
    eas: {
      ...appConfig.expo.extra?.eas,
      ...config?.extra?.eas,
      build: {
        ...appConfig.expo.extra?.eas?.build,
        experimental: {
          ...appConfig.expo.extra?.eas?.build?.experimental,
          ios: {
            ...appConfig.expo.extra?.eas?.build?.experimental?.ios,
            // The share extension's bundle id must track the active variant so
            // each install owns its own extension target.
            appExtensions: (
              appConfig.expo.extra?.eas?.build?.experimental?.ios
                ?.appExtensions ?? []
            ).map((ext) =>
              ext.targetName === "expo-sharing-extension"
                ? {
                    ...ext,
                    bundleIdentifier: `${bundleId}.expo-sharing-extension`,
                  }
                : ext,
            ),
          },
        },
      },
    },
    // Ship the full font license with the native app's Expo manifest.
    fontLicenses: require("./assets/fonts/spectral-license.json"),
    // Public ingestion key for Shelvr; development stays opt-in via env.
    posthogProjectToken:
      process.env.POSTHOG_PROJECT_TOKEN ??
      (isProduction
        ? "phc_C8xznYZsCFESYcnhi2VtyaJVP2AfivECFpo8ARXAp3V2"
        : undefined),
    posthogHost: process.env.POSTHOG_HOST ?? "https://us.i.posthog.com",
  },
});
