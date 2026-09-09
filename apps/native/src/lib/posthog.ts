import Constants from 'expo-constants';
import PostHog from 'posthog-react-native';

const posthogProjectToken = Constants.expoConfig?.extra?.posthogProjectToken as
  | string
  | undefined;
const posthogHost = Constants.expoConfig?.extra?.posthogHost as
  | string
  | undefined;

// Analytics is optional in local development and in builds that do not have
// PostHog configured. The analytics boundary treats this as a no-op instead of
// making the app fail during module initialization.
export const posthog =
  posthogProjectToken && posthogHost
    ? new PostHog(posthogProjectToken, {
        host: posthogHost,
        captureAppLifecycleEvents: true,
        enableSessionReplay: true,
        sessionReplayConfig: {
          maskAllTextInputs: true,
          maskAllImages: true,
          maskAllSandboxedViews: true,
          captureLog: false,
          captureNetworkTelemetry: false,
          sampleRate: 0.2,
          throttleDelayMs: 1000,
        },
        errorTracking: {
          autocapture: {
            console: [],
          },
        },
      })
    : undefined;

posthog?.register({
  environment: Constants.expoConfig?.extra?.variant ?? 'development',
  analytics_version: 1,
});
