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

  it("does nothing when analytics is not configured", () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "");

    captureWebAnalyticsEvent("page_viewed");

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
