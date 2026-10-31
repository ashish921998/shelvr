import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { inviteHeading, inviteSummary, loadListInvite } from "./listInvite";

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

const invite = {
  inviterName: "Ashish",
  name: "Goa weekend",
  placeCount: 3,
  cities: ["Goa", "Panaji"],
  placeNames: ["Thalassa", "Gunpowder"],
};

describe("loadListInvite", () => {
  it("is unavailable without a Convex deployment", async () => {
    vi.stubEnv("CONVEX_SITE_URL", "");
    vi.stubEnv("CONVEX_URL", "");
    expect(await loadListInvite("abc")).toEqual({ outcome: "unavailable" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fetches the invite uncached", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(invite), { status: 200 }),
    );
    expect(await loadListInvite("a/b")).toEqual({ outcome: "found", invite });
    expect(fetch).toHaveBeenCalledWith(
      "https://deployment.convex.site/list/invites/a%2Fb",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("tells a dead link from an outage", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 404 }));
    expect(await loadListInvite("gone")).toEqual({ outcome: "missing" });
    expect(mocks.serverLog).not.toHaveBeenCalled();

    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 500 }));
    expect(await loadListInvite("x")).toEqual({ outcome: "unavailable" });
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("offline"));
    expect(await loadListInvite("x")).toEqual({ outcome: "unavailable" });
    expect(mocks.serverLog).toHaveBeenCalledTimes(2);
  });
});

describe("invite copy", () => {
  it("names the inviter, or says someone", () => {
    expect(inviteHeading(invite)).toBe("Ashish wants to save places with you");
    expect(inviteHeading({ ...invite, inviterName: undefined })).toBe(
      "Someone wants to save places with you",
    );
    expect(inviteHeading(undefined)).toBe(
      "Someone wants to save places with you",
    );
  });

  it("summarises the count and cities", () => {
    expect(inviteSummary(invite)).toBe("3 places · Goa, Panaji");
    expect(inviteSummary({ ...invite, placeCount: 1, cities: [] })).toBe(
      "1 place",
    );
  });
});
