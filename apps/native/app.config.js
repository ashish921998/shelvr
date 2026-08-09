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

function displayName(base) {
  if (isProduction) return base;
  if (variant === 'preview') return `${base} (Preview)`;
  return `${base} (Dev)`;
}

const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;

module.exports = ({ config }) => ({
  ...appConfig.expo,
  ...config,
  name: displayName(appConfig.expo.name ?? 'Shelvr'),
  icon: isProduction ? appConfig.expo.icon : './assets/icon-dev.png',
  ios: {
    ...appConfig.expo.ios,
    ...config?.ios,
    icon: isProduction ? appConfig.expo.ios?.icon : './assets/icon-dev.png',
    bundleIdentifier: bundleId,
  },
  android: {
    ...appConfig.expo.android,
    ...config?.android,
    icon: isProduction ? appConfig.expo.android?.icon : undefined,
    adaptiveIcon: isProduction
      ? appConfig.expo.android?.adaptiveIcon
      : { ...appConfig.expo.android?.adaptiveIcon, foregroundImage: './assets/icon-dev.png' },
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
              appConfig.expo.extra?.eas?.build?.experimental?.ios?.appExtensions ?? []
            ).map((ext) =>
              ext.targetName === 'expo-sharing-extension'
                ? { ...ext, bundleIdentifier: `${bundleId}.expo-sharing-extension` }
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
