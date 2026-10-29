import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadTripShare, tripMapUrl } from "./tripShare";
vi.mock("@/lib/serverLog", () => ({ serverLog: vi.fn() }));
const token = "a".repeat(32);
const trip = {
  city: "Lisbon",
  days: [[{ name: "Cafe & bakery", lat: 38.7, lng: -9.1 }]],
  unplanned: [],
};
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  vi.stubEnv("CONVEX_SITE_URL", "https://example.convex.site");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("public trip", () => {
  it("loads uncached and encodes map destinations", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(trip)));
    expect(await loadTripShare(token)).toEqual({ outcome: "found", trip });
    expect(fetch).toHaveBeenCalledWith(
      `https://example.convex.site/trip/shares/${token}`,
      expect.objectContaining({ cache: "no-store" }),
    );
    const map = new URL(tripMapUrl(trip.days[0][0]));
    expect(map.searchParams.get("q")).toBe("Cafe & bakery");
    expect(map.searchParams.get("ll")).toBe("38.7,-9.1");
  });
  it("does not fetch malformed tokens and distinguishes revocation from outages", async () => {
    expect(await loadTripShare("../bad")).toEqual({ outcome: "missing" });
    expect(fetch).not.toHaveBeenCalled();
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 404 }));
    expect(await loadTripShare(token)).toEqual({ outcome: "missing" });
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 503 }));
    expect(await loadTripShare(token)).toEqual({ outcome: "unavailable" });
    vi.mocked(fetch).mockRejectedValueOnce(new Error("offline"));
    expect(await loadTripShare(token)).toEqual({ outcome: "unavailable" });
  });
  it("refuses malformed itinerary data", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          ...trip,
          days: [[{ name: "Bad", lat: 999, lng: 0 }]],
        }),
      ),
    );
    expect(await loadTripShare(token)).toEqual({ outcome: "unavailable" });
  });
});
