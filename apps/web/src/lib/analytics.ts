type AnalyticsProperties = Record<string, boolean | number | string>;

export function capture(event: string, properties: AnalyticsProperties = {}) {
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
}
