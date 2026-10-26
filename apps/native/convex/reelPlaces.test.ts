// @vitest-environment edge-runtime
import { afterEach, describe, expect, it, vi } from "vitest";
import { internal } from "./_generated/api";
import { WAITLIST_CLIENT_IP_HEADER, WAITLIST_SECRET_HEADER } from "./http";
import { newConvexTest } from "./test.setup";

const SECRET = "reel-places-test-secret";
const IP = "203.0.113.9";
const REEL = "https://www.instagram.com/reel/C8abc123/";

afterEach(() => {
  vi.unstubAllEnvs();
});

function find(
  t: ReturnType<typeof newConvexTest>,
  body: unknown,
  secret = SECRET,
) {
  return t.fetch("/reel-places", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      [WAITLIST_SECRET_HEADER]: secret,
      [WAITLIST_CLIENT_IP_HEADER]: IP,
    },
    body: JSON.stringify(body),
  });
}

describe("reelPlacesLimits", () => {
  it("stops the ninth lookup from one IP within the hour", async () => {
    const t = newConvexTest();
    for (let i = 0; i < 8; i++) {
      await expect(
        t.mutation(internal.oracleLimits.claimReelPlaces, { ip: IP }),
      ).resolves.toBeNull();
    }
    await expect(
      t.mutation(internal.oracleLimits.claimReelPlaces, { ip: IP }),
    ).rejects.toThrow();
    await expect(
      t.mutation(internal.oracleLimits.claimReelPlaces, {
        ip: "198.51.100.9",
      }),
    ).resolves.toBeNull();
  });

  it("counts every address in one IPv6 /64 as the same visitor", async () => {
    const t = newConvexTest();
    for (let i = 0; i < 8; i++) {
      await t.mutation(internal.oracleLimits.claimReelPlaces, {
        ip: `2001:db8:1:2::${i + 1}`,
      });
    }
    await expect(
      t.mutation(internal.oracleLimits.claimReelPlaces, {
        ip: "2001:db8:1:2:ffff::9",
      }),
    ).rejects.toThrow();
  });

  it("budgets request bodies for the route on its own", async () => {
    const t = newConvexTest();
    await expect(
      t.mutation(internal.oracleLimits.claimRequestBody, {
        ip: IP,
        route: "reel-places",
      }),
    ).resolves.toBeNull();
  });
});

describe("POST /reel-places", () => {
  it("rejects a caller without the shared secret", async () => {
    vi.stubEnv("WAITLIST_SHARED_SECRET", SECRET);
    const t = newConvexTest();
    expect((await find(t, { url: REEL }, "wrong")).status).toBe(401);
  });

  it("answers a link that is not a reel or TikTok with 400, spending nothing", async () => {
    vi.stubEnv("WAITLIST_SHARED_SECRET", SECRET);
    const t = newConvexTest();
    for (let i = 0; i < 10; i++) {
      expect((await find(t, { url: "https://example.com/a" })).status).toBe(
        400,
      );
    }
    for (let i = 0; i < 8; i++) {
      await expect(
        t.mutation(internal.oracleLimits.claimReelPlaces, { ip: IP }),
      ).resolves.toBeNull();
    }
  });

  it("answers 429 once the visitor's bucket is empty", async () => {
    vi.stubEnv("WAITLIST_SHARED_SECRET", SECRET);
    const t = newConvexTest();
    for (let i = 0; i < 8; i++) {
      await t.mutation(internal.oracleLimits.claimReelPlaces, { ip: IP });
    }
    expect((await find(t, { url: REEL })).status).toBe(429);
  });
});

const pageRead = vi.hoisted(() => vi.fn());
const generateObject = vi.hoisted(() => vi.fn());
vi.mock("./model/pageRead", () => ({ readPage: pageRead }));
vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("ai")>()),
  generateObject,
}));

describe("reelPlaces.find", () => {
  const ok = (content: string) => ({
    status: "ok",
    page: { title: "Lisbon food crawl", content },
  });

  it("reads the caption only, without following its links", async () => {
    pageRead.mockResolvedValue(ok("Time Out Market"));
    generateObject.mockResolvedValue({ object: { places: [] } });
    const t = newConvexTest();
    await t.action(internal.reelPlaces.find, { url: REEL });
    expect(pageRead).toHaveBeenCalledWith(REEL, { captionOnly: true });
  });

  it("lists the places the caption names and no invented ones", async () => {
    pageRead.mockResolvedValue(ok("Time Out Market then Pastéis de Belém"));
    generateObject.mockResolvedValue({
      object: {
        places: [
          { name: "Time Out Market", city: "Lisbon" },
          { name: "Pastéis de Belém", city: "Lisbon" },
          { name: "Louvre", city: "Paris" },
        ],
      },
    });
    const t = newConvexTest();
    await expect(
      t.action(internal.reelPlaces.find, { url: REEL }),
    ).resolves.toEqual({
      status: "ok",
      places: [
        { name: "Time Out Market", city: "Lisbon" },
        { name: "Pastéis de Belém", city: "Lisbon" },
      ],
      city: "Lisbon",
    });
  });

  it("skips the model when the page gave no words", async () => {
    generateObject.mockClear();
    pageRead.mockResolvedValue({ status: "ok", page: {} });
    const t = newConvexTest();
    await expect(
      t.action(internal.reelPlaces.find, { url: REEL }),
    ).resolves.toEqual({ status: "ok", places: [] });
    expect(generateObject).not.toHaveBeenCalled();
  });

  it("gives up on a page that takes too long to read", async () => {
    vi.useFakeTimers();
    try {
      pageRead.mockReturnValue(new Promise(() => {}));
      const t = newConvexTest();
      const result = t.action(internal.reelPlaces.find, { url: REEL });
      await vi.advanceTimersByTimeAsync(11_000);
      await expect(result).resolves.toEqual({
        status: "unreadable",
        places: [],
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports a page it could not read", async () => {
    pageRead.mockResolvedValue({ status: "unreadable" });
    const t = newConvexTest();
    await expect(
      t.action(internal.reelPlaces.find, { url: REEL }),
    ).resolves.toEqual({ status: "unreadable", places: [] });
  });
});
