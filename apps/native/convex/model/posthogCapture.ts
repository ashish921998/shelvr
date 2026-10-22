import { env } from "../_generated/server";

const CAPTURE_TIMEOUT_MS = 3000;

const RETRY_BASE_MS = 1000;

type PostHogDelivery =
  | { status: "delivered" }
  | { status: "unconfigured" }
  | { status: "rejected"; httpStatus: number }
  | { status: "retryable"; httpStatus?: number; error?: unknown };

type PostHogEvent = {
  event: string;
  distinctId: string;
  deliveryId: string;
  timestamp?: number;
  properties: Record<string, unknown>;
};

export function newDeliveryId(): string {
  return crypto.randomUUID();
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
          environment:
            env.OBSERVABILITY_ENV === "production"
              ? "production"
              : "development",
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
