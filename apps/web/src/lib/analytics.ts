type AnalyticsProperties = Record<string, boolean | number | string>;

/** Capture one web analytics event without allowing telemetry failures to break the UI. */
export function captureWebAnalyticsEvent(
  event: string,
  properties: AnalyticsProperties = {},
) {
  // Analytics must never break the UI: localStorage and crypto access can
  // throw in restrictive privacy modes, and callers fire capture outside
  // their own error handling (e.g. WaitlistForm before its try block).
  try {
    const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
    const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;

    if (!token || !host || typeof window === "undefined") return;

    const distinctIdKey = "shelvr_web_distinct_id";
    const distinctId =
      window.localStorage.getItem(distinctIdKey) ?? window.crypto.randomUUID();

    window.localStorage.setItem(distinctIdKey, distinctId);

    void fetch(`${host.replace(/\/$/, "")}/capture/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: token,
        event,
        properties: {
          distinct_id: distinctId,
          $current_url: window.location.href,
          ...properties,
        },
      }),
      keepalive: true,
    });
  } catch {
    return;
  }
}
