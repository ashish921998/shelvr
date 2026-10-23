import Constants from "expo-constants";
import * as Updates from "expo-updates";
import PostHog from "posthog-react-native";
import { Platform } from "react-native";

const posthogProjectToken = Constants.expoConfig?.extra?.posthogProjectToken as
  | string
  | undefined;
const posthogHost = Constants.expoConfig?.extra?.posthogHost as
  | string
  | undefined;

const REPLAY_VARIANTS = new Set<unknown>(["development", "preview"]);

const EXCEPTION_AUTOCAPTURE_VARIANTS = new Set<unknown>([
  "production",
  "preview",
]);
const captureExceptions = EXCEPTION_AUTOCAPTURE_VARIANTS.has(
  Constants.expoConfig?.extra?.variant,
);

const SAFE_ERROR_MESSAGES = new Set(["Network request failed"]);

const SAFE_EXCEPTION_CODE = /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/;

type ExceptionEntry = {
  type?: unknown;
  value?: unknown;
  stacktrace?: { frames?: unknown };
};

/** The one rule for exception text that may leave the device: a fixed allowlisted message or a bare code token. */
export function safeExceptionValue(value: unknown): string | undefined {
  return typeof value === "string" &&
    (SAFE_ERROR_MESSAGES.has(value) ||
      (value.length <= 80 && SAFE_EXCEPTION_CODE.test(value)))
    ? value
    : undefined;
}

function sanitizeExceptionValue(value: unknown, fallback: unknown): unknown {
  return safeExceptionValue(value) ?? fallback;
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
  if ("$exception_message" in record) {
    record.$exception_message = sanitizeExceptionValue(
      record.$exception_message,
      record.$exception_type,
    );
  }
}

function hasStackFrames(entry: ExceptionEntry | null): boolean {
  const frames = entry?.stacktrace?.frames;
  return Array.isArray(frames) && frames.length > 0;
}

// PostHog groups an exception by its stack frames, and by its type alone when
// there are none, so every stackless handled failure would share one "Error"
// issue. `error_event` is the captureError code, already sent as is. The value
// is re-checked here so the fingerprint stays safe whatever ran before.
function groupStacklessFailure(properties: unknown): void {
  if (typeof properties !== "object" || properties === null) return;
  const record = properties as Record<string, unknown>;
  const code = record.error_event;
  const list = record.$exception_list as (ExceptionEntry | null)[] | undefined;
  if (typeof code !== "string" || !Array.isArray(list)) return;
  if (list.some(hasStackFrames)) return;
  const cause = sanitizeExceptionValue(list[0]?.value, list[0]?.type);
  record.$exception_fingerprint =
    typeof cause === "string" ? `${code}:${cause}` : code;
  record.$issue_name = code;
}

function dropLaunchUrl(event: {
  event: string;
  properties?: Record<string, unknown>;
}): void {
  if (event.event === "Application Opened" && event.properties) {
    delete event.properties.url;
  }
}

export const posthog =
  posthogProjectToken && posthogHost
    ? new PostHog(posthogProjectToken, {
        host: posthogHost,
        captureAppLifecycleEvents: true,
        // Both default to true in posthog-react-native >= 4.73 and activate
        // through @posthog/react-native-plugin. The native SDK builds and sends
        // `$push_notification_opened` itself, so `before_send` below never sees
        // it and cannot apply the redaction this file exists to enforce. Push
        // tokens are already owned by `notificationDevices` in Convex, so
        // mirroring them into PostHog would widen what leaves the device for no
        // product gain. Fail closed, as replay and exception autocapture do.
        capturePushNotificationSubscriptions: false,
        capturePushNotificationOpened: false,
        enableSessionReplay: REPLAY_VARIANTS.has(
          Constants.expoConfig?.extra?.variant,
        ),
        sessionReplayConfig: {
          maskAllTextInputs: true,
          maskAllImages: true,
          maskAllSandboxedViews: true,
          captureLog: false,
          captureNetworkTelemetry: false,
          sampleRate: 1,
          throttleDelayMs: 1000,
        },
        // The object form resolves omitted keys to false: an empty
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
            groupStacklessFailure(event.properties);
            dropLaunchUrl(event);
          }
          return event;
        },
      })
    : undefined;

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

export function superProperties(): Record<string, string | number | boolean> {
  return {
    environment: Constants.expoConfig?.extra?.variant ?? "development",
    platform: Platform.OS,
    analytics_version: 1,
    ...updateProperties(),
  };
}

posthog?.register(superProperties());

function resetClient(client: PostHog): void {
  client.reset();
  client.register(superProperties());
}

export async function resetIfIdentified(client: PostHog): Promise<void> {
  await client.ready();
  const distinctId = client.getDistinctId();
  const anonymousId = client.getAnonymousId();
  if (distinctId && anonymousId && distinctId !== anonymousId) {
    resetClient(client);
  }
}

export function isAnalyticsAvailable(): boolean {
  return posthog !== undefined && !posthog.isDisabled && !posthog.optedOut;
}
