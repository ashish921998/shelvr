// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

import { capturePageview } from "./pageview";

const fetchMock = vi.fn();

function sentProperties() {
  const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return JSON.parse(String(init.body)).properties;
}

describe("capturePageview", () => {
  beforeEach(() => {
    // Node's own storage globals shadow jsdom's, as in analytics.test.ts.
    for (const name of ["localStorage", "sessionStorage"]) {
      const storage = new Map<string, string>();
      Object.defineProperty(window, name, {
        configurable: true,
        value: {
          clear: () => storage.clear(),
          getItem: (key: string) => storage.get(key) ?? null,
          setItem: (key: string, value: string) => storage.set(key, value),
        } satisfies Pick<Storage, "clear" | "getItem" | "setItem">,
      });
    }
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "test-token");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://us.i.posthog.com");
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
  });

  it("carries the campaign and the referring host", () => {
    window.history.replaceState(null, "", "/?ct=Reddit");
    vi.spyOn(document, "referrer", "get").mockReturnValue(
      "https://www.reddit.com/r/apps/comments/abc?utm=x",
    );

    capturePageview();

    expect(sentProperties()).toMatchObject({
      campaign: "reddit",
      $referring_domain: "www.reddit.com",
      $pathname: "/",
    });
  });

  it("never sends a share token", () => {
    window.history.replaceState(null, "", "/i/secret-token");
    vi.spyOn(document, "referrer", "get").mockReturnValue("");

    capturePageview();

    const properties = sentProperties();
    expect(JSON.stringify(properties)).not.toContain("secret-token");
    expect(properties.$pathname).toBe("/i/[token]");
    expect(properties).not.toHaveProperty("$referring_domain");
  });
});
