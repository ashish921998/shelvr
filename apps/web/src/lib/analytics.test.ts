// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

import { captureWebAnalyticsEvent, captureWebException } from "./analytics";

const fetchMock = vi.fn();

describe("web analytics", () => {
  beforeEach(() => {
    const storage = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        clear: () => storage.clear(),
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
      } satisfies Pick<Storage, "clear" | "getItem" | "setItem">,
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "test-token");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://us.i.posthog.com/");
    window.localStorage.clear();
    window.localStorage.setItem("shelvr_web_distinct_id", "browser-123");
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
  });

  it("sends events with a stable browser identifier", () => {
    captureWebAnalyticsEvent("app_store_clicked", { source: "hero" });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://us.i.posthog.com/capture/",
      expect.objectContaining({
        method: "POST",
        keepalive: true,
      }),
    );
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({
      api_key: "test-token",
      event: "app_store_clicked",
      properties: {
        distinct_id: "browser-123",
        source: "hero",
      },
    });
  });

  it("sanitizes email addresses and URLs in exception events", () => {
    captureWebException(
      new Error(
        "Could not send person@example.com to https://example.com/path",
      ),
      { boundary: "route" },
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse(String(init.body));
    expect(payload.properties).toMatchObject({
      $exception_type: "Error",
      boundary: "route",
    });
    expect(payload.properties.$exception_list[0].value).toBe(
      "Could not send [email] to [url]",
    );
  });

  it("sends one UUIDv7 session id across events in a session", () => {
    captureWebAnalyticsEvent("$pageview");
    captureWebAnalyticsEvent("$pageleave");

    const [first, second] = fetchMock.mock.calls.map(
      ([, init]) => JSON.parse(String((init as RequestInit).body)).properties,
    );
    expect(first.$session_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(second.$session_id).toBe(first.$session_id);
  });

  it("starts a new session after 30 idle minutes", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const start = Date.UTC(2026, 10, 3, 12);
    const sessionAt = (minutes: number) => {
      vi.setSystemTime(start + minutes * 60 * 1000);
      captureWebAnalyticsEvent("$pageview");
      const [, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
      return JSON.parse(String(init.body)).properties.$session_id;
    };

    const first = sessionAt(0);
    expect(sessionAt(29)).toBe(first);
    expect(sessionAt(58)).toBe(first);
    expect(sessionAt(89)).not.toBe(first);
    vi.useRealTimers();
  });

  it("redacts a page the caller names", () => {
    captureWebAnalyticsEvent("$pageleave", {}, { pathname: "/p/private" });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body)).properties.$current_url).toBe(
      `${window.location.origin}/p/[token]`,
    );
  });

  it("does nothing when analytics is not configured", () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "");

    captureWebAnalyticsEvent("page_viewed");

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

it("redacts capability URLs even when event properties try to override them", () => {
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "test-token");
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://example.com");
  window.history.replaceState({}, "", "/i/private-capability?input=private");
  const spy = vi.fn().mockResolvedValue(new Response());
  vi.stubGlobal("fetch", spy);
  captureWebException(new Error("render failed"), {
    $current_url: "https://example.com/i/private-capability",
  });
  const body = JSON.parse(spy.mock.calls[0][1].body);
  expect(body.properties.$current_url).toBe(
    `${window.location.origin}/i/[token]`,
  );
  window.history.replaceState({}, "", "/");
});

it("redacts plan vote links too", () => {
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "test-token");
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://example.com");
  window.history.replaceState({}, "", "/p/private-plan");
  const spy = vi.fn().mockResolvedValue(new Response());
  vi.stubGlobal("fetch", spy);
  captureWebException(new Error("render failed"), {});
  const body = JSON.parse(spy.mock.calls[0][1].body);
  expect(body.properties.$current_url).toBe(
    `${window.location.origin}/p/[token]`,
  );
  window.history.replaceState({}, "", "/");
});
