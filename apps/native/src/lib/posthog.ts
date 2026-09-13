import Constants from 'expo-constants';
import PostHog from 'posthog-react-native';

const posthogProjectToken = Constants.expoConfig?.extra?.posthogProjectToken as
  | string
  | undefined;
const posthogHost = Constants.expoConfig?.extra?.posthogHost as
  | string
  | undefined;

const REPLAY_VARIANTS = new Set<unknown>(['development', 'preview']);

// Analytics is optional in local development and in builds that do not have
// PostHog configured. The analytics boundary treats this as a no-op instead of
// making the app fail during module initialization.
export const posthog =
  posthogProjectToken && posthogHost
    ? new PostHog(posthogProjectToken, {
        host: posthogHost,
        captureAppLifecycleEvents: true,
        // Replay stays off in production until visual masking is verified on a
        // signed build. Fail closed: only builds that declare a non-production
        // variant record, so a missing `extra` can never turn replay on.
        enableSessionReplay: REPLAY_VARIANTS.has(Constants.expoConfig?.extra?.variant),
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

/** True when the client analytics boundary may capture. The single canonical
 * check — every analytics facade (feedback, cancel survey) delegates here
 * instead of re-deriving availability from the client's state. */
export function isAnalyticsAvailable(): boolean {
  return posthog !== undefined && !posthog.isDisabled && !posthog.optedOut;
}
