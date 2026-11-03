type AnalyticsProperties = Record<
  string,
  boolean | number | string | unknown[]
>;

const SESSION_KEY = "shelvr_web_session";
const SESSION_IDLE_MS = 30 * 60 * 1000;

function uuidV7(now: number): string {
  const bytes = window.crypto.getRandomValues(new Uint8Array(16));
  let time = now;
  for (let i = 5; i >= 0; i -= 1) {
    bytes[i] = time % 256;
    time = Math.floor(time / 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function storedSession(): { id: string; lastActivity: number } | null {
  try {
    const session = JSON.parse(window.localStorage.getItem(SESSION_KEY) ?? "");
    return typeof session?.id === "string" &&
      typeof session?.lastActivity === "number"
      ? session
      : null;
  } catch {
    return null;
  }
}

export function webSessionId(now = Date.now()): string {
  const session = storedSession();
  const id =
    session && now - session.lastActivity < SESSION_IDLE_MS
      ? session.id
      : uuidV7(now);
  window.localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ id, lastActivity: now }),
  );
  return id;
}

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
  { pathname }: { pathname?: string } = {},
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
          $session_id: webSessionId(),
          $current_url: `${window.location.origin}${(pathname ?? window.location.pathname).replace(/^\/(i|p)\/[^/]+/, "/$1/[token]")}`,
        },
      }),
      keepalive: true,
    });
  } catch {
    return;
  }
}
