import { verifiedVerdict } from "@/lib/oracleProof";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  preflight: vi.fn(),
  serverLog: vi.fn(),
}));

vi.mock("@/lib/serverLog", () => ({
  serverLog: mocks.serverLog,
}));

import { POST } from "./route";

function request(body: string): Request {
  return new Request("https://shelvr.test/api/oracle", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "203.0.113.7, 10.0.0.1",
    },
    body,
  });
}

const tabs = JSON.stringify({ kind: "tabs", count: 40, titles: [] });
const verdict = {
  persona: "The Tab Hoarder",
  tagline: "Forty tabs, zero regrets.",
  spaces: [],
  guesses: [],
};

describe("POST /api/oracle", () => {
  it("rejects a denied parsing budget without reading the body", async () => {
    mocks.preflight.mockResolvedValue(Response.json({}, { status: 429 }));
    const input = request("not-json");
    const result = await POST(input);
    expect(result.status).toBe(429);
    expect(input.bodyUsed).toBe(false);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("enforces UTF-8 bytes for bodies without Content-Length", async () => {
    const result = await POST(request("é".repeat(3 * 1024 * 1024 + 1)));
    expect(result.status).toBe(413);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  beforeEach(() => {
    mocks.preflight.mockReset();
    mocks.preflight.mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", (url: string, init: RequestInit) =>
      url.endsWith("/request-body")
        ? mocks.preflight(url, init)
        : mocks.fetch(url, init),
    );
    vi.stubEnv("CONVEX_SITE_URL", "https://example.convex.site");
    vi.stubEnv("WAITLIST_SHARED_SECRET", "secret");
    mocks.fetch.mockReset();
    mocks.serverLog.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("forwards the body with the secret and visitor IP, and returns the verdict", async () => {
    mocks.fetch.mockResolvedValue(Response.json(verdict));

    const result = await POST(request(tabs));

    expect(result.status).toBe(200);
    const resultBody = await result.json();
    expect(resultBody).toMatchObject(verdict);
    expect(await verifiedVerdict(resultBody.shareCode)).toEqual({
      mode: "tabs",
      persona: verdict.persona,
      tagline: verdict.tagline,
      spaces: verdict.spaces,
    });
    const [url, init] = mocks.fetch.mock.calls[0];
    expect(url).toBe("https://example.convex.site/oracle");
    expect(init.body).toBe(tabs);
    expect(init.headers).toMatchObject({
      "x-waitlist-secret": "secret",
      "x-shelvr-client-ip": "203.0.113.7",
    });
  });

  it("gives a screenshot the longer upstream deadline", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    mocks.fetch.mockResolvedValue(Response.json(verdict));

    await POST(request(tabs));
    await POST(
      request(JSON.stringify({ kind: "screenshot", imageBase64: "aGk=" })),
    );

    expect(
      timeout.mock.calls.map(([ms]) => ms).filter((ms) => ms >= 20_000),
    ).toEqual([20_000, 45_000]);
    timeout.mockRestore();
  });

  it.each([
    [429, 429],
    [400, 400],
    [500, 502],
  ])("maps an upstream %i to %i", async (upstream, expected) => {
    mocks.fetch.mockResolvedValue(Response.json({}, { status: upstream }));

    const result = await POST(request(tabs));

    expect(result.status).toBe(expected);
  });

  it("logs a category, not the error text, when Convex fails", async () => {
    mocks.fetch.mockResolvedValue(Response.json({}, { status: 503 }));

    await POST(request(tabs));

    expect(mocks.serverLog).toHaveBeenCalledWith(
      "error",
      "oracle_request_failed",
      {
        kind: "tabs",
        error_category: "convex_status_503",
      },
    );
  });

  it("rejects a body over 6 MB before contacting Convex", async () => {
    const huge = JSON.stringify({
      kind: "screenshot",
      imageBase64: "A".repeat(6 * 1024 * 1024),
    });

    const result = await POST(request(huge));

    expect(result.status).toBe(413);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("rejects a body with no kind", async () => {
    const result = await POST(request(JSON.stringify({ urls: [] })));

    expect(result.status).toBe(400);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
