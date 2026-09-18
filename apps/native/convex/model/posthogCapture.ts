import { env } from "../_generated/server";

/**
 * One PostHog `/capture/` delivery mechanism for every backend event.
 *
 * Callers own their event vocabulary (name, distinct id, properties) and
 * nothing else: the host, the project-token guard, the request deadline, the
 * envelope, the `uuid` dedupe id, the retry classification and the backoff all
 * live here so the four capture sites cannot drift apart again.
 */

/** How long a single capture may take before it counts as a failed attempt.
 * Telemetry never holds up the work that produced it. */
const CAPTURE_TIMEOUT_MS = 3000;

/** First retry delay. Each further attempt multiplies it by ten: 1s, 10s,
 * 100s, ... — long enough for a provider incident to clear between tries. */
const RETRY_BASE_MS = 1000;

export type PostHogDelivery =
  /** PostHog accepted the event. */
  | { status: "delivered" }
  /** No project token on the deployment, so nothing was sent. */
  | { status: "unconfigured" }
  /** A 4xx other than rate limiting: the same body will never be accepted, so
   * retrying it only burns attempts. */
  | { status: "rejected"; httpStatus: number }
  /** Rate limiting, a server error, a timeout, or a transport failure. */
  | { status: "retryable"; httpStatus?: number; error?: unknown };

export type PostHogEvent = {
  event: string;
  distinctId: string;
  /** Retry-stable dedupe id. PostHog drops a repeat of the same `uuid`, so
   * every attempt at one event must send the id minted for the first. */
  deliveryId: string;
  /** When the event happened, in ms. Omit to let PostHog stamp arrival. */
  timestamp?: number;
  /** Merged over the defaults below, so a caller may override `environment`. */
  properties: Record<string, unknown>;
};

/** A fresh dedupe id for one event, reused across that event's retries. */
export function newDeliveryId(): string {
  return crypto.randomUUID();
}

/** The deployment's event environment tag. Only the production deployment
 * labels events `production`, so a staging or local run can never land in a
 * production dashboard. */
export function captureEnvironment(): string {
  return env.OBSERVABILITY_ENV === "production" ? "production" : "development";
}

export async function deliverPostHogEvent(
  request: PostHogEvent,
): Promise<PostHogDelivery> {
  const apiKey = env.POSTHOG_PROJECT_TOKEN;
  if (!apiKey) return { status: "unconfigured" };
  const host = (env.POSTHOG_HOST ?? "https://us.i.posthog.com").replace(
    /\/$/,
    "",
  );
  try {
    const response = await fetch(`${host}/capture/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(CAPTURE_TIMEOUT_MS),
      body: JSON.stringify({
        api_key: apiKey,
        event: request.event,
        uuid: request.deliveryId,
        ...(request.timestamp !== undefined
          ? { timestamp: new Date(request.timestamp).toISOString() }
          : {}),
        properties: {
          distinct_id: request.distinctId,
          environment: captureEnvironment(),
          ...request.properties,
        },
      }),
    });
    if (response.ok) return { status: "delivered" };
    if (
      response.status >= 400 &&
      response.status < 500 &&
      response.status !== 429
    ) {
      return { status: "rejected", httpStatus: response.status };
    }
    return { status: "retryable", httpStatus: response.status };
  } catch (error) {
    return { status: "retryable", error };
  }
}

/**
 * Schedule the next attempt at one event, or report that the event is lost.
 *
 * The caller passes the scheduling call itself, so each capture keeps its own
 * internal action as the retry target (and its own argument shape) while the
 * schedule lives in one place. Returns false when `attempt` was the last one
 * allowed or the scheduler refused the call, leaving the caller to record the
 * loss the way its event needs. It never throws: the first attempt at an event
 * runs inline with the work that produced it (a classification, a save, a
 * sign-up), and a telemetry hiccup must not fail that work.
 */
export async function scheduleCaptureRetry(
  attempt: number,
  maxAttempts: number,
  schedule: (delayMs: number, nextAttempt: number) => Promise<unknown>,
): Promise<boolean> {
  if (attempt >= maxAttempts) return false;
  try {
    await schedule(RETRY_BASE_MS * 10 ** attempt, attempt + 1);
    return true;
  } catch {
    return false;
  }
}
