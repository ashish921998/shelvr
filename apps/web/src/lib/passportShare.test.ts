import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  loadPassport,
  recordPassportOpen,
  passportSummary,
  passportTitle,
  type SharedPassport,
} from "./passportShare";

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

const passport: SharedPassport = {
  ownerName: "Maya",
  places: 3,
  cities: 2,
  countries: 1,
  byCity: [
    { city: "Lisbon", names: ["Tigre", "Bar Alto"] },
    { city: "Porto", names: ["Majestic"] },
  ],
};

describe("loadPassport", () => {
  it("fetches the page uncached", async () => {
    vi.mocked(fetch).mockImplementation(
      async () => new Response(JSON.stringify(passport), { status: 200 }),
    );
    expect(await loadPassport("a/b")).toEqual({ outcome: "found", passport });
    expect(fetch).toHaveBeenLastCalledWith(
      "https://deployment.convex.site/passport/shares/a%2Fb",
      expect.objectContaining({
        cache: "no-store",
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("tells a stopped link from an outage", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 404 }));
    expect(await loadPassport("gone")).toEqual({ outcome: "missing" });
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 500 }));
    expect(await loadPassport("down")).toEqual({ outcome: "unavailable" });
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("offline"));
    expect(await loadPassport("down")).toEqual({ outcome: "unavailable" });
    expect(mocks.serverLog).toHaveBeenCalledTimes(2);
  });

  it("is unavailable without a Convex deployment", async () => {
    vi.stubEnv("CONVEX_SITE_URL", "");
    vi.stubEnv("CONVEX_URL", "");
    expect(await loadPassport("abc")).toEqual({ outcome: "unavailable" });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("recordPassportOpen", () => {
  it("posts the open, and logs only a real failure", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 204 }));
    await recordPassportOpen("a/b");
    expect(fetch).toHaveBeenLastCalledWith(
      "https://deployment.convex.site/passport/shares/a%2Fb",
      { method: "POST", signal: expect.any(AbortSignal) },
    );
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 404 }));
    await recordPassportOpen("gone");
    expect(mocks.serverLog).not.toHaveBeenCalled();
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 500 }));
    await recordPassportOpen("down");
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("offline"));
    await recordPassportOpen("down");
    expect(mocks.serverLog).toHaveBeenCalledTimes(2);
  });
});

describe("passport text", () => {
  it("names the owner and counts places, cities and countries", () => {
    expect(passportTitle(passport)).toBe("Maya’s passport");
    expect(passportTitle({ ...passport, ownerName: undefined })).toBe(
      "A Shelvr passport",
    );
    expect(passportSummary(passport)).toBe("3 places · 2 cities · 1 country");
    expect(passportSummary({ ...passport, places: 1, countries: null })).toBe(
      "1 place · 2 cities",
    );
  });
});
