import Constants from "expo-constants";
import * as Updates from "expo-updates";
import PostHog from "posthog-react-native";

const posthogProjectToken = Constants.expoConfig?.extra?.posthogProjectToken as
  | string
  | undefined;
const posthogHost = Constants.expoConfig?.extra?.posthogHost as
  | string
  | undefined;

const REPLAY_VARIANTS = new Set<unknown>(["development", "preview"]);

// Distributed builds report crashes; local development does not. A dev machine
// crash on an unmerged branch would otherwise open an error issue next to
// production traffic under the shared project token. Fail closed like replay: a
// missing `extra` reads as "development" everywhere, so it never turns capture
// on.
const EXCEPTION_AUTOCAPTURE_VARIANTS = new Set<unknown>([
  "production",
  "preview",
]);
const captureExceptions = EXCEPTION_AUTOCAPTURE_VARIANTS.has(
  Constants.expoConfig?.extra?.variant,
);

// Convex validation and network failures can interpolate user content (saved
// URLs, note text) into Error.message, so only messages known to be fixed
// strings ever cross the wire; the class name and stack always ship.
// analytics.captureError applies this policy to handled errors, and the
// `before_send` hook below extends it to SDK-autocaptured crashes.
export const SAFE_ERROR_MESSAGES = new Set(["Network request failed"]);

function sanitizeExceptionValue(value: unknown, fallback: unknown): unknown {
  return typeof value === "string" && SAFE_ERROR_MESSAGES.has(value)
    ? value
    : fallback;
}

function redactExceptionProperties(properties: unknown): void {
  if (typeof properties !== "object" || properties === null) return;
  const record = properties as Record<string, unknown>;
  const list = record.$exception_list;
  if (Array.isArray(list)) {
    record.$exception_list = list.map((entry) => {
      if (typeof entry !== "object" || entry === null) return entry;
      const frame = entry as Record<string, unknown>;
      return {
        ...frame,
        value: sanitizeExceptionValue(frame.value, frame.type),
      };
    });
  }
  // Only rewrite the message when the SDK captured one — an unconditional
  // assignment would stamp an undefined `$exception_message` key onto every
  // lifecycle and custom event passing through the hook.
  if ("$exception_message" in record) {
    record.$exception_message = sanitizeExceptionValue(
      record.$exception_message,
      record.$exception_type,
    );
  }
}

// The SDK attaches the launch deep link to "Application Opened". That URL can
// carry an OAuth callback code or saved content, so it never leaves the device.
function dropLaunchUrl(event: {
  event: string;
  properties?: Record<string, unknown>;
}): void {
  if (event.event === "Application Opened" && event.properties) {
    delete event.properties.url;
  }
}

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
        enableSessionReplay: REPLAY_VARIANTS.has(
          Constants.expoConfig?.extra?.variant,
        ),
        sessionReplayConfig: {
          maskAllTextInputs: true,
          maskAllImages: true,
          maskAllSandboxedViews: true,
          captureLog: false,
          captureNetworkTelemetry: false,
          sampleRate: 0.2,
          throttleDelayMs: 1000,
        },
        // The object form resolves omitted keys to false — an empty
        // `console: []` alone silently disables crash capture. Exceptions are
        // additionally gated server-side by the project's "exception
        // autocapture" remote config.
        errorTracking: {
          autocapture: {
            uncaughtExceptions: captureExceptions,
            unhandledRejections: captureExceptions,
            console: [],
          },
        },
        // eslint-disable-next-line @typescript-eslint/naming-convention -- the SDK's option key is fixed snake_case
        before_send: (event) => {
          if (event !== null) {
            redactExceptionProperties(event.properties);
            dropLaunchUrl(event);
          }
          return event;
        },
      })
    : undefined;

// `$app_build` stays the store build across OTA updates, so the running
// update is recorded separately to tell which JS a user had.
function updateProperties(): Record<string, string | boolean> {
  try {
    return {
      ...(Updates.updateId ? { ota_update_id: Updates.updateId } : {}),
      ...(Updates.channel ? { ota_channel: Updates.channel } : {}),
      ota_embedded: Updates.isEmbeddedLaunch,
    };
  } catch {
    return {};
  }
}

/** Properties registered on every event, and again after each reset. */
export function superProperties(): Record<string, string | number | boolean> {
  return {
    environment: Constants.expoConfig?.extra?.variant ?? "development",
    analytics_version: 1,
    ...updateProperties(),
  };
}

posthog?.register(superProperties());

/** True when the client analytics boundary may capture. The single canonical
 * check — every analytics facade (feedback, cancel survey) delegates here
 * instead of re-deriving availability from the client's state. */
export function isAnalyticsAvailable(): boolean {
  return posthog !== undefined && !posthog.isDisabled && !posthog.optedOut;
}
