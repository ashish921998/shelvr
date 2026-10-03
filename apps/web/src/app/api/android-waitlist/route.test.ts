import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  serverLog: vi.fn(),
}));

vi.mock("@/lib/serverLog", () => ({
  serverLog: mocks.serverLog,
}));

import { POST } from "./route";

function request(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://shelvr.test/api/android-waitlist", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/android-waitlist", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mocks.fetch);
    vi.stubEnv("CONVEX_SITE_URL", "");
    vi.stubEnv("CONVEX_URL", "");
    vi.stubEnv("WAITLIST_SHARED_SECRET", "");
    mocks.fetch.mockReset();
    mocks.serverLog.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("rejects malformed JSON", async () => {
    const malformed = new Request("https://shelvr.test/api/android-waitlist", {
      method: "POST",
      body: "not-json",
      headers: { "content-type": "application/json" },
    });

    const result = await POST(malformed);

    expect(result.status).toBe(400);
    await expect(result.json()).resolves.toEqual({
      message: "Invalid request.",
    });
  });

  it("rejects invalid email addresses before contacting Convex", async () => {
    const result = await POST(request({ email: "not-an-email" }));

    expect(result.status).toBe(400);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("accepts honeypot submissions without persisting them", async () => {
    const result = await POST(request({ company: "bot" }));

    expect(result.status).toBe(200);
    await expect(result.json()).resolves.toEqual({ ok: true });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("returns 503 when the Convex connection is not configured", async () => {
    const result = await POST(request({ email: "person@example.com" }));

    expect(result.status).toBe(503);
    expect(mocks.serverLog).toHaveBeenCalledWith(
      "error",
      "android_waitlist_unconfigured",
      { has_site_url: false, has_shared_secret: false },
    );
  });

  it("forwards normalized signup data and the visitor IP", async () => {
    vi.stubEnv("CONVEX_SITE_URL", "https://example.convex.site/");
    vi.stubEnv("WAITLIST_SHARED_SECRET", "test-secret");
    mocks.fetch.mockResolvedValue(
      response({ saved: true, emailProviderSynced: true }),
    );

    const result = await POST(
      request(
        { email: " Person@Example.com ", source: "hero" },
        { "x-forwarded-for": "203.0.113.4, 10.0.0.1" },
      ),
    );

    expect(result.status).toBe(200);
    await expect(result.json()).resolves.toEqual({
      ok: true,
      emailProviderSynced: true,
    });
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.fetch).toHaveBeenCalledWith(
      "https://example.convex.site/waitlist/join",
      expect.objectContaining({
        method: "POST",
        signal: expect.any(AbortSignal),
      }),
    );

    const [, init] = mocks.fetch.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toEqual({
      "content-type": "application/json",
      "x-waitlist-secret": "test-secret",
      "x-shelvr-client-ip": "203.0.113.4",
    });
    expect(JSON.parse(String(init.body))).toEqual({
      email: "person@example.com",
      product: "shelvr-android",
      source: "hero",
    });
  });

  it("derives the Convex site URL and normalizes unknown sources", async () => {
    vi.stubEnv("CONVEX_URL", "https://deployment.convex.cloud");
    vi.stubEnv("WAITLIST_SHARED_SECRET", "test-secret");
    mocks.fetch.mockResolvedValue(response({ saved: true }));

    await POST(request({ email: "person@example.com", source: "unknown" }));

    expect(mocks.fetch).toHaveBeenCalledWith(
      "https://deployment.convex.site/waitlist/join",
      expect.any(Object),
    );
    const [, init] = mocks.fetch.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({
      source: "unknown",
    });
  });

  it.each([
    [400, 400, "Enter a valid email address."],
    [429, 429, "Too many attempts. Please try again later."],
  ])("maps an upstream %s response to %s", async (_, status, message) => {
    vi.stubEnv("CONVEX_SITE_URL", "https://example.convex.site");
    vi.stubEnv("WAITLIST_SHARED_SECRET", "test-secret");
    mocks.fetch.mockResolvedValue(response({}, status));

    const result = await POST(request({ email: "person@example.com" }));

    expect(result.status).toBe(status);
    await expect(result.json()).resolves.toEqual({ message });
  });

  it("returns a safe error when Convex fails or does not confirm the save", async () => {
    vi.stubEnv("CONVEX_SITE_URL", "https://example.convex.site");
    vi.stubEnv("WAITLIST_SHARED_SECRET", "test-secret");
    mocks.fetch.mockResolvedValue(response({ saved: false }));

    const result = await POST(request({ email: "person@example.com" }));

    expect(result.status).toBe(502);
    await expect(result.json()).resolves.toEqual({
      message: "Could not join right now. Please try again.",
    });
    expect(mocks.serverLog).toHaveBeenCalledWith(
      "error",
      "android_waitlist_failed",
      { error_category: "Error" },
    );
  });
});
