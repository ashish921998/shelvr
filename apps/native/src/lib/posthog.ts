import Constants from 'expo-constants';
import PostHog from 'posthog-react-native';

const posthogProjectToken = Constants.expoConfig?.extra?.posthogProjectToken as
  | string
  | undefined;
const posthogHost = Constants.expoConfig?.extra?.posthogHost as string | undefined;

function requirePostHogConfiguration(variableName: string, value: string | undefined) {
  if (!value && __DEV__) {
    throw new Error(
      `${variableName} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${variableName} is configured`,
    );
  }
}

requirePostHogConfiguration('POSTHOG_PROJECT_TOKEN', posthogProjectToken);
requirePostHogConfiguration('POSTHOG_HOST', posthogHost);

export const posthog =
  posthogProjectToken && posthogHost
    ? new PostHog(posthogProjectToken, {
        host: posthogHost,
        captureAppLifecycleEvents: true,
        errorTracking: {
          autocapture: {
            console: [],
          },
        },
      })
    : undefined;
