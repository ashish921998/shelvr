import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "../_generated/dataModel";
import { appleTravelEstimate, travelAccessToken } from "./appleTravel";
import { safeFetch } from "./safeFetch";

vi.mock("./safeFetch", () => ({ safeFetch: vi.fn() }));
vi.mock("./appleMaps", () => ({
  appleMapsAccessToken: async (_config: unknown, fetcher: typeof fetch) => {
    const response = await fetcher("https://maps-api.apple.com/v1/token", {
      headers: { Authorization: "Bearer signed-test-token" },
    });
    const body = await response.json();
    return body?.accessToken ?? null;
  },
}));
const from = { _id: "from" as Id<"tripStops">, lat: 38.7, lng: -9.1 };
const to = { _id: "to" as Id<"tripStops">, lat: 38.71, lng: -9.12 };
const eta = {
  destination: { latitude: to.lat, longitude: to.lng },
  transportType: "WALKING",
  expectedTravelTimeSeconds: 650,
  distanceMeters: 850,
};
function reply(body: unknown) {
  return {
    ok: true as const,
    bytes: new TextEncoder().encode(JSON.stringify(body)),
    contentType: "application/json",
    finalUrl: "https://maps-api.apple.com",
    status: 200,
  };
}
beforeEach(() => vi.resetAllMocks());

describe("Apple travel times", () => {
  it("uses bounded safe fetch for token exchange", async () => {
    vi.mocked(safeFetch).mockResolvedValue(
      reply({ accessToken: "test-token" }),
    );
    expect(
      await travelAccessToken({
        privateKey: "key",
        keyId: "id",
        teamId: "team",
      }),
    ).toBe("test-token");
    expect(safeFetch).toHaveBeenCalledWith(
      "https://maps-api.apple.com/v1/token",
      expect.objectContaining({
        maxRedirects: 0,
        maxBytes: 32768,
        headers: { Authorization: "Bearer signed-test-token" },
      }),
    );
  });
  it("returns real walking time and road distance for the requested destination", async () => {
    vi.mocked(safeFetch).mockResolvedValue(reply({ etas: [eta] }));
    expect(await appleTravelEstimate("token", from, to, "walking")).toEqual({
      seconds: 650,
      meters: 850,
    });
    const url = new URL(vi.mocked(safeFetch).mock.calls[0][0]);
    expect(url.searchParams.get("origin")).toBe("38.7,-9.1");
    expect(url.searchParams.get("destinations")).toBe("38.71,-9.12");
    expect(url.searchParams.get("transportType")).toBe("Walking");
  });
  it("requests driving explicitly and accepts Apple's uppercase transport mode", async () => {
    vi.mocked(safeFetch).mockResolvedValue(
      reply({ etas: [{ ...eta, transportType: "AUTOMOBILE" }] }),
    );
    expect(
      await appleTravelEstimate("token", from, to, "driving"),
    ).not.toBeNull();
    expect(String(vi.mocked(safeFetch).mock.calls[0][0])).toContain(
      "transportType=Automobile",
    );
  });
  it("does not invent times for missing, malformed, mismatched or failed routes", async () => {
    for (const body of [
      null,
      {},
      { etas: [] },
      { etas: [{ ...eta, expectedTravelTimeSeconds: -1 }] },
      { etas: [{ ...eta, transportType: "TRANSIT" }] },
      { etas: [{ ...eta, destination: { latitude: 0, longitude: 0 } }] },
    ]) {
      vi.mocked(safeFetch).mockResolvedValue(reply(body));
      expect(
        await appleTravelEstimate("token", from, to, "walking"),
      ).toBeNull();
    }
    vi.mocked(safeFetch).mockResolvedValue({ ok: false, code: "timeout" });
    expect(await appleTravelEstimate("token", from, to, "walking")).toBeNull();
    vi.mocked(safeFetch).mockResolvedValue({
      ...reply(null),
      bytes: new TextEncoder().encode("not json"),
    });
    expect(await appleTravelEstimate("token", from, to, "walking")).toBeNull();
  });
});
