type AnalyticsProperties = Record<
  string,
  boolean | number | string | unknown[]
>;

function safeExceptionValue(message: string): string {
  return message
    .replace(/\b[\w.+-]+@[\w.-]+\.\w+\b/g, "[email]")
    .replace(/\bhttps?:\/\/\S+/gi, "[url]");
}

export function captureWebException(
  error: unknown,
  properties: AnalyticsProperties = {},
) {
  const type = error instanceof Error ? error.name : typeof error;
  captureWebAnalyticsEvent("$exception", {
    $exception_type: type,
    $exception_level: "error",
    $exception_list: [
      {
        type,
        value:
          error instanceof Error
            ? safeExceptionValue(error.message)
            : String(error),
      },
    ],
    ...properties,
  });
}

export function captureWebAnalyticsEvent(
  event: string,
  properties: AnalyticsProperties = {},
) {
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
          ...properties,
          $current_url: `${window.location.origin}${window.location.pathname.replace(/^\/(i|p)\/[^/]+/, "/$1/[token]")}`,
        },
      }),
      keepalive: true,
    });
  } catch {
    return;
  }
}
