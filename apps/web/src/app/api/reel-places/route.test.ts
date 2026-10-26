import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  preflight: vi.fn(),
  serverLog: vi.fn(),
}));

vi.mock("@/lib/serverLog", () => ({ serverLog: mocks.serverLog }));

import { POST } from "./route";

const REEL = "https://www.instagram.com/reel/C8abc123/";

function request(body: string): Request {
  return new Request("https://shelvr.test/api/reel-places", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "203.0.113.7, 10.0.0.1",
    },
    body,
  });
}

const link = (url: string) => request(JSON.stringify({ url }));

describe("POST /api/reel-places", () => {
  beforeEach(() => {
    mocks.preflight.mockReset();
    mocks.preflight.mockResolvedValue(new Response(null, { status: 204 }));
    mocks.fetch.mockReset();
    mocks.serverLog.mockReset();
    vi.stubGlobal("fetch", (url: string, init: RequestInit) =>
      url.endsWith("/request-body")
        ? mocks.preflight(url, init)
        : mocks.fetch(url, init),
    );
    vi.stubEnv("CONVEX_SITE_URL", "https://example.convex.site");
    vi.stubEnv("WAITLIST_SHARED_SECRET", "secret");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("rejects a denied parsing budget without reading the body", async () => {
    mocks.preflight.mockResolvedValue(Response.json({}, { status: 429 }));
    const input = request("not-json");
    expect((await POST(input)).status).toBe(429);
    expect(input.bodyUsed).toBe(false);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("answers a link that is not a reel or TikTok with 400, spending nothing", async () => {
    expect((await POST(link("https://example.com/a"))).status).toBe(400);
    expect((await POST(request("not-json"))).status).toBe(400);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("refuses a body over the cap", async () => {
    expect((await POST(request("x".repeat(5 * 1024)))).status).toBe(413);
  });

  it("forwards the link with the secret and visitor IP, and returns the places", async () => {
    mocks.fetch.mockResolvedValue(
      Response.json({
        places: [{ name: "Time Out Market", city: "Lisbon" }],
        city: "Lisbon",
      }),
    );
    const response = await POST(link(REEL));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      places: [{ name: "Time Out Market", city: "Lisbon" }],
      city: "Lisbon",
    });
    const [url, init] = mocks.fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://example.convex.site/reel-places");
    expect(init.headers).toMatchObject({
      "x-waitlist-secret": "secret",
      "x-shelvr-client-ip": "203.0.113.7",
    });
    expect(JSON.parse(String(init.body))).toEqual({ url: REEL });
  });

  it("passes a rate limit on as 429 and an unreadable link as 422", async () => {
    mocks.fetch.mockResolvedValueOnce(new Response(null, { status: 429 }));
    expect((await POST(link(REEL))).status).toBe(429);
    mocks.fetch.mockResolvedValueOnce(new Response(null, { status: 422 }));
    expect((await POST(link(REEL))).status).toBe(422);
  });

  it("answers 502 and logs a category when the backend fails", async () => {
    mocks.fetch.mockResolvedValue(new Response(null, { status: 500 }));
    expect((await POST(link(REEL))).status).toBe(502);
    expect(mocks.serverLog).toHaveBeenCalledWith(
      "error",
      "reel_places_request_failed",
      { error_category: "convex_status_500" },
    );
  });

  it("answers 503 when the backend is not configured", async () => {
    vi.stubEnv("WAITLIST_SHARED_SECRET", "");
    expect((await POST(link(REEL))).status).toBe(503);
  });
});
