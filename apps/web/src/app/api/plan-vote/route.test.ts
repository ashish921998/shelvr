import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), serverLog: vi.fn() }));
vi.mock("@/lib/serverLog", () => ({ serverLog: mocks.serverLog }));

import { POST } from "./route";

const vote = { token: "abc", voterId: "v1", picks: ["p0"], passes: ["p1"] };

function request(body: unknown): Request {
  return new Request("https://shelvr.test/api/plan-vote", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "203.0.113.7, 10.0.0.1",
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/plan-vote", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mocks.fetch);
    vi.stubEnv("CONVEX_SITE_URL", "https://deployment.convex.site");
    vi.stubEnv("WAITLIST_SHARED_SECRET", "secret");
    mocks.fetch.mockReset();
    mocks.serverLog.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("forwards a vote with the secret and the visitor IP", async () => {
    mocks.fetch.mockResolvedValue(new Response("{}", { status: 200 }));
    const result = await POST(request(vote));

    expect(result.status).toBe(200);
    const [url, init] = mocks.fetch.mock.calls[0];
    expect(url).toBe("https://deployment.convex.site/plan/votes");
    expect(init.headers).toMatchObject({
      "x-waitlist-secret": "secret",
      "x-shelvr-client-ip": "203.0.113.7",
    });
    // Passed on as it came: Convex reads the ballot's shape, once.
    expect(init.body).toBe(JSON.stringify(vote));
  });

  it("bounds the body here and leaves its shape to Convex", async () => {
    expect(
      (await POST(request({ ...vote, voterId: "x".repeat(4096) }))).status,
    ).toBe(413);
    expect(mocks.fetch).not.toHaveBeenCalled();

    mocks.fetch.mockResolvedValueOnce(new Response("{}", { status: 400 }));
    expect((await POST(request("{"))).status).toBe(400);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it("says why a vote was refused", async () => {
    for (const status of [404, 409, 429]) {
      mocks.fetch.mockResolvedValueOnce(new Response("{}", { status }));
      expect((await POST(request(vote))).status).toBe(status);
    }
    mocks.fetch.mockResolvedValueOnce(new Response("{}", { status: 500 }));
    expect((await POST(request(vote))).status).toBe(502);
    expect(mocks.serverLog).toHaveBeenCalledWith("error", "plan_vote_failed", {
      error_category: "convex_status_500",
    });
  });

  it("answers 503 when Convex is not configured", async () => {
    vi.stubEnv("WAITLIST_SHARED_SECRET", "");
    expect((await POST(request(vote))).status).toBe(503);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
