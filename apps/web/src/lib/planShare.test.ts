import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadPlanShare, planTitle } from "./planShare";

const mocks = vi.hoisted(() => ({ serverLog: vi.fn() }));
vi.mock("@/lib/serverLog", () => ({ serverLog: mocks.serverLog }));

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  vi.stubEnv("CONVEX_SITE_URL", "https://deployment.convex.site");
  mocks.serverLog.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const share = {
  senderName: "Ashish",
  city: "Goa",
  expiresAt: 1,
  places: [{ key: "p0", name: "Thalassa", why: "Sunset dinner" }],
};

describe("loadPlanShare", () => {
  it("is unavailable without a Convex deployment", async () => {
    vi.stubEnv("CONVEX_SITE_URL", "");
    vi.stubEnv("CONVEX_URL", "");
    expect(await loadPlanShare("abc")).toEqual({ outcome: "unavailable" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fetches the share uncached", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(share), { status: 200 }),
    );
    expect(await loadPlanShare("a/b")).toEqual({ outcome: "found", share });
    expect(fetch).toHaveBeenCalledWith(
      "https://deployment.convex.site/plan/shares/a%2Fb",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("tells a closed link from an outage", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 404 }));
    expect(await loadPlanShare("gone")).toEqual({ outcome: "missing" });
    expect(mocks.serverLog).not.toHaveBeenCalled();

    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 500 }));
    expect(await loadPlanShare("x")).toEqual({ outcome: "unavailable" });
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("offline"));
    expect(await loadPlanShare("x")).toEqual({ outcome: "unavailable" });
    expect(mocks.serverLog).toHaveBeenCalledTimes(2);
  });
});

describe("planTitle", () => {
  it("names the sender and the city when it has them", () => {
    expect(planTitle(share)).toBe("Ashish’s shortlist for Goa");
    expect(planTitle({ ...share, senderName: undefined })).toBe(
      "A shortlist for Goa",
    );
    expect(planTitle({ ...share, city: undefined })).toBe("Ashish’s shortlist");
    expect(planTitle(undefined)).toBe("A shortlist");
  });
});
