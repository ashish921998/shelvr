import { pageViewPath } from "@/lib/pageView";

type AnalyticsProperties = Record<
  string,
  boolean | number | string | unknown[]
>;

const SESSION_KEY = "shelvr_web_session";
const SESSION_IDLE_MS = 30 * 60 * 1000;

function uuidV7(now: number): string {
  const time = now.toString(16).padStart(12, "0");
  return `${time.slice(0, 8)}-${time.slice(8)}-7${window.crypto.randomUUID().slice(15)}`;
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

function webSessionId(): string {
  const now = Date.now();
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
          $current_url: `${window.location.origin}${pageViewPath(pathname ?? window.location.pathname)}`,
        },
      }),
      keepalive: true,
    });
  } catch {
    return;
  }
}
