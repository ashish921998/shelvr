const appConfig = require("./app.json");
const {
  productionCloudOrigin,
  productionSiteOrigin,
  isExactOrigin,
} = require("./production-origins");
const localizationConfig = require("./localization.config.json");
const supportedLocales = [
  ...new Set(Object.values(localizationConfig.storeLocales)),
].sort();
const supportsRTL = supportedLocales.some((locale) =>
  ["ar", "he", "ur"].includes(locale.split("-")[0]),
);

const BASE_ID = "app.shelvr.save";

const variant = process.env.APP_VARIANT ?? "development";

const idSuffix =
  variant === "production" ? "" : variant === "preview" ? ".preview" : ".dev";
const bundleId = BASE_ID + idSuffix;

const isProduction = variant === "production";
const isDevelopment = !isProduction && variant !== "preview";

function requireProductionValue(name, value, isValid, expected) {
  if (isProduction && process.env.EAS_BUILD === "true" && !isValid(value)) {
    throw new Error(`Production config requires ${name} (${expected}).`);
  }
}

const buildPlatform = process.env.EAS_BUILD_PLATFORM;
const productionConvexUrl = productionCloudOrigin;
const developmentTestKey = "test_VOYicTvOGPXCBFMVdHzyxRndiRi";
if (!isProduction) {
  let convexOrigin;
  try {
    convexOrigin = new URL(process.env.EXPO_PUBLIC_CONVEX_URL).origin;
  } catch {}
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
requireProductionValue(
  "EXPO_PUBLIC_CONVEX_URL",
  process.env.EXPO_PUBLIC_CONVEX_URL,
  (value) => isExactOrigin(value, productionCloudOrigin),
  "the Shelvr production deployment URL",
);

requireProductionValue(
  "EXPO_PUBLIC_CONVEX_SITE_URL",
  process.env.EXPO_PUBLIC_CONVEX_SITE_URL,
  (value) => isExactOrigin(value, productionSiteOrigin),
  "the Shelvr production HTTP origin",
);

function displayName(base) {
  if (isProduction) return base;
  if (variant === "preview") return `${base} (Preview)`;
  return `${base} (Dev)`;
}

const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;
if (buildPlatform === "android") {
  requireProductionValue(
    "GOOGLE_MAPS_API_KEY",
    googleMapsApiKey,
    (value) => Boolean(value),
    "a Google Maps API key so expo-maps is configured on Android",
  );
}

const uploadsSourceMaps = Boolean(process.env.POSTHOG_CLI_API_KEY);
const requestedAndroidBuildArchs = (process.env.ANDROID_BUILD_ARCHS ?? "")
  .split(",")
  .map((arch) => arch.trim())
  .filter(Boolean);

module.exports = ({ config }) => ({
  ...appConfig.expo,
  ...config,
  name: displayName(appConfig.expo.name ?? "Shelvr"),
  icon: isProduction ? appConfig.expo.icon : "./assets/icon-dev.png",
  scheme: isProduction ? "shelvr" : `shelvr${idSuffix.replace(".", "-")}`,
  ios: {
    ...appConfig.expo.ios,
    ...config?.ios,
    icon: isProduction ? appConfig.expo.ios?.icon : "./assets/icon-dev.png",
    infoPlist: {
      ...appConfig.expo.ios?.infoPlist,
      ...config?.ios?.infoPlist,
      INAlternativeAppNames: [
        { INAlternativeAppName: appConfig.expo.name ?? "Shelvr" },
      ],
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
    associatedDomains: isProduction
      ? [
          "applinks:shelvr-web.vercel.app",
          "webcredentials:shelvr-web.vercel.app",
        ]
      : [],
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
    package: bundleId,
  },
  locales: Object.fromEntries(
    supportedLocales.map((locale) => [locale, `./locales/${locale}.json`]),
  ),
  plugins: [
    "./plugins/with-google-services",
    "./plugins/with-android-share-new-intent",
    "./plugins/with-android-accent",
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
        addGeneratedScheme: isDevelopment,
      },
    ],
    [
      "expo-widgets",
      {
        groupIdentifier: `group.${bundleId}`,
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
    ...(uploadsSourceMaps
      ? [["posthog-react-native/expo", { skipOnConflict: true }]]
      : []),
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
            appExtensions: (
              appConfig.expo.extra?.eas?.build?.experimental?.ios
                ?.appExtensions ?? []
            ).map((ext) =>
              ext.targetName === "expo-sharing-extension"
                ? {
                    ...ext,
                    bundleIdentifier: `${bundleId}.expo-sharing-extension`,
                    entitlements: {
                      ...ext.entitlements,
                      "com.apple.security.application-groups": [
                        `group.${bundleId}`,
                      ],
                    },
                  }
                : ext,
            ),
          },
        },
      },
    },
    fontLicenses: require("./assets/fonts/crimson-pro-license.json"),
    posthogProjectToken:
      process.env.POSTHOG_PROJECT_TOKEN ??
      (isProduction
        ? "phc_C8xznYZsCFESYcnhi2VtyaJVP2AfivECFpo8ARXAp3V2"
        : undefined),
    posthogHost: process.env.POSTHOG_HOST ?? "https://us.i.posthog.com",
  },
});
