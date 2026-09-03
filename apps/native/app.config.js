const appConfig = require('./app.json');

const BASE_ID = 'app.shelvr.save';

// APP_VARIANT is set per EAS build profile (see eas.json). When unset — i.e. a
// local `expo start` / `expo run` — we fall back to "development" so a simulator
// install never collides with a production App Store install.
const variant = process.env.APP_VARIANT ?? 'development';

const idSuffix =
  variant === 'production' ? '' : variant === 'preview' ? '.preview' : '.dev';
const bundleId = BASE_ID + idSuffix;

// Non-production installs share a distinct icon so dev/preview builds are
// unmistakable on the home screen next to the App Store build.
const isProduction = variant === 'production';
const isDevelopment = !isProduction && variant !== 'preview';

// Values are passed explicitly (never read via process.env[name]) so the
// expo/no-dynamic-env-var lint rule stays satisfied.
function requireProductionValue(name, value, isValid, expected) {
  if (isProduction && process.env.EAS_BUILD === 'true' && !isValid(value)) {
    throw new Error(`Production config requires ${name} (${expected}).`);
  }
}

// Fail the build before an invalid public SDK key can reach App Review. Builds
// 14 and 16 presented RevenueCat Error 23 during Apple's sandbox purchase flow;
// the rejected build artifact contained a different key from the current
// RevenueCat App Store app. Keep this as a permanent release guardrail.
const buildPlatform = process.env.EAS_BUILD_PLATFORM;
if (buildPlatform !== 'android') {
  requireProductionValue(
    'EXPO_PUBLIC_REVENUECAT_IOS_KEY',
    process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
    (value) => value?.startsWith('appl_'),
    'an appl_ App Store public SDK key',
  );
}
if (buildPlatform === 'android') {
  requireProductionValue(
    'EXPO_PUBLIC_REVENUECAT_ANDROID_KEY',
    process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
    (value) => value?.startsWith('goog_'),
    'a goog_ Google Play public SDK key',
  );
}
if (buildPlatform !== 'android') {
  requireProductionValue(
    'ACTIVATION_PAL_IOS_KEY',
    process.env.ACTIVATION_PAL_IOS_KEY,
    (value) => value?.startsWith('ap_pk_'),
    'an ap_pk_ public app key',
  );
}
// The production Convex URL must parse as https:// with a hostname — a bare
// prefix check would let `https://` (no host) reach a store build.
requireProductionValue(
  'EXPO_PUBLIC_CONVEX_URL',
  process.env.EXPO_PUBLIC_CONVEX_URL,
  (value) => {
    if (!value) return false;
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && url.hostname.length > 0;
    } catch {
      return false;
    }
  },
  'an https:// production deployment URL',
);

function displayName(base) {
  if (isProduction) return base;
  if (variant === 'preview') return `${base} (Preview)`;
  return `${base} (Dev)`;
}

const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;
const requestedAndroidBuildArchs = (process.env.ANDROID_BUILD_ARCHS ?? '')
  .split(',')
  .map((arch) => arch.trim())
  .filter(Boolean);

module.exports = ({ config }) => ({
  ...appConfig.expo,
  ...config,
  name: displayName(appConfig.expo.name ?? 'Shelvr'),
  icon: isProduction ? appConfig.expo.icon : './assets/icon-dev.png',
  ios: {
    ...appConfig.expo.ios,
    ...config?.ios,
    icon: isProduction ? appConfig.expo.ios?.icon : './assets/icon-dev.png',
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
      ...(process.env.ACTIVATION_PAL_IOS_KEY
        ? {
            ActivationPalApp: 'shelvr',
            ActivationPalKey: process.env.ACTIVATION_PAL_IOS_KEY,
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
          foregroundImage: './assets/icon-dev.png',
        },
    ...(googleMapsApiKey
      ? { config: { googleMaps: { apiKey: googleMapsApiKey } } }
      : {}),
    package: bundleId,
  },
  plugins: [
    // Keep the static plugins from app.json — an inline array here would
    // silently replace them (expo-font, expo-router, expo-sharing, …).
    ...(appConfig.expo.plugins ?? []),
    [
      'expo-build-properties',
      {
        android: {
          // Store builds only need physical-device ABIs. Skipping emulator
          // architectures keeps native C++ compilation within EAS limits.
          buildArchs:
            requestedAndroidBuildArchs.length > 0
              ? requestedAndroidBuildArchs
              : isProduction
                ? ['arm64-v8a', 'armeabi-v7a']
                : ['arm64-v8a', 'armeabi-v7a', 'x86', 'x86_64'],
        },
      },
    ],
    [
      'expo-dev-client',
      {
        // The generated scheme lets a development client (app.shelvr.save.dev)
        // open dev-tool deep links without clashing with the production scheme.
        addGeneratedScheme: isDevelopment,
      },
    ],
    [
      'expo-widgets',
      {
        groupIdentifier: 'group.app.shelvr.save',
        widgets: [
          {
            name: 'RecentSaves',
            displayName: 'Recent Saves',
            description: 'Your latest saves, at a glance.',
            supportedFamilies: ['systemSmall', 'systemMedium'],
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
              ext.targetName === 'expo-sharing-extension'
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
    posthogProjectToken: process.env.POSTHOG_PROJECT_TOKEN,
    posthogHost: process.env.POSTHOG_HOST,
  },
});
