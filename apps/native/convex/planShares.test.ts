// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { WAITLIST_CLIENT_IP_HEADER, WAITLIST_SECRET_HEADER } from "./http";
import { MAX_PLAN_VOTERS, PLAN_SHARE_TTL_MS } from "./planShares";
import { newConvexTest, signedInUser } from "./test.setup";

const SECRET = "plan-vote-test-secret";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

async function setup(options: { pro?: boolean } = {}) {
  const backend = newConvexTest();
  const { t, userId } = await signedInUser(backend, {
    email: "priya.sharma@example.com",
    pro: options.pro ?? true,
  });
  const { spaceId, itemIds } = await t.run(async (ctx) => {
    await ctx.db.patch(userId, { name: "Priya Sharma" });
    const spaceId = await ctx.db.insert("spaces", {
      userId,
      name: "Goa",
    });
    const itemIds: Id<"items">[] = [];
    for (const title of ["Thalassa", "Gunpowder"]) {
      itemIds.push(
        await ctx.db.insert("items", {
          userId,
          type: "link",
          status: "ready",
          title,
          tags: [],
          searchText: title,
        }),
      );
    }
    return { spaceId, itemIds };
  });
  const places = [
    {
      name: "Thalassa",
      area: "Vagator",
      why: "Sunset dinner",
      itemId: itemIds[0],
    },
    { name: "Gunpowder", why: "South Indian", itemId: itemIds[1] },
  ];
  return { backend, t, userId, spaceId, itemIds, places };
}

function vote(
  backend: ReturnType<typeof newConvexTest>,
  token: string,
  voterId: string,
  picks: string[],
  passes: string[] = [],
  ip = "203.0.113.7",
) {
  return backend.mutation(internal.planShares.recordPlanVote, {
    token,
    voterId,
    picks,
    passes,
    ip,
  });
}

describe("createPlanShare", () => {
  it("snapshots the plan and shows it publicly without the item ids", async () => {
    const { backend, t, spaceId, places } = await setup();
    const token = await t.mutation(api.planShares.createPlanShare, {
      spaceId,
      city: "  Goa ",
      places,
    });
    expect(token).toMatch(/^[0-9a-f]{32}$/);

    const share = await backend.query(internal.planShares.getPublicPlanShare, {
      token,
    });
    expect(share).toEqual({
      senderName: "Priya",
      city: "Goa",
      expiresAt: expect.any(Number),
      places: [
        { key: "p0", name: "Thalassa", area: "Vagator", why: "Sunset dinner" },
        { key: "p1", name: "Gunpowder", why: "South Indian" },
      ],
    });
  });

  it("requires Pro, the caller's space and the caller's saves", async () => {
    const { backend, t, spaceId, places } = await setup({ pro: false });
    await expect(
      t.mutation(api.planShares.createPlanShare, { spaceId, places }),
    ).rejects.toThrow();

    const other = await signedInUser(backend, { pro: true });
    await expect(
      other.t.mutation(api.planShares.createPlanShare, { spaceId, places }),
    ).rejects.toThrow("Space not found");
  });

  it("refuses an empty plan and a save from another account", async () => {
    const { backend, t, spaceId, places } = await setup();
    await expect(
      t.mutation(api.planShares.createPlanShare, { spaceId, places: [] }),
    ).rejects.toThrow();

    const other = await signedInUser(backend, { pro: true });
    const foreignItem = await other.t.run(async (ctx) =>
      ctx.db.insert("items", {
        userId: other.userId,
        type: "note",
        status: "ready",
        title: "Elsewhere",
        tags: [],
        searchText: "Elsewhere",
      }),
    );
    await expect(
      t.mutation(api.planShares.createPlanShare, {
        spaceId,
        places: [{ ...places[0], itemId: foreignItem }],
      }),
    ).rejects.toThrow("Item not found");
  });
});

describe("votes", () => {
  it("keeps one answer per visitor and tallies them for the owner", async () => {
    const { backend, t, spaceId, places } = await setup();
    const token = await t.mutation(api.planShares.createPlanShare, {
      spaceId,
      places,
    });

    expect(await vote(backend, token, "a", ["p0", "zz"], ["p1"])).toBe(
      "recorded",
    );
    // A changed mind replaces the earlier answer; a key in both lists is a pick.
    expect(await vote(backend, token, "a", ["p1"], ["p0", "p1"])).toBe(
      "recorded",
    );
    expect(await vote(backend, token, "b", ["p1"])).toBe("recorded");

    expect(
      await t.query(api.planShares.latestPlanShare, { spaceId }),
    ).toMatchObject({
      token,
      voters: 2,
      places: [
        { key: "p0", name: "Thalassa", picks: 0, passes: 1 },
        { key: "p1", name: "Gunpowder", picks: 2, passes: 0 },
      ],
    });
  });

  it("caps voters per link", async () => {
    const { backend, t, spaceId, places } = await setup();
    const token = await t.mutation(api.planShares.createPlanShare, {
      spaceId,
      places,
    });
    for (let i = 0; i < MAX_PLAN_VOTERS; i++) {
      await vote(backend, token, `v${i}`, ["p0"], [], `203.0.113.${i}`);
    }
    expect(await vote(backend, token, "late", ["p0"], [], "198.51.100.1")).toBe(
      "full",
    );
    // Someone already on the link can still change their answer.
    expect(await vote(backend, token, "v0", ["p1"], [], "198.51.100.1")).toBe(
      "recorded",
    );
  });

  it("gives no slot to an empty ballot from someone new", async () => {
    const { backend, t, spaceId, places } = await setup();
    const token = await t.mutation(api.planShares.createPlanShare, {
      spaceId,
      places,
    });
    expect(await vote(backend, token, "empty", [])).toBe("recorded");
    expect(
      await t.query(api.planShares.latestPlanShare, { spaceId }),
    ).toMatchObject({ voters: 0 });
  });

  it("closes the link after a week", async () => {
    vi.useFakeTimers();
    const { backend, t, spaceId, places } = await setup();
    const token = await t.mutation(api.planShares.createPlanShare, {
      spaceId,
      places,
    });
    vi.advanceTimersByTime(PLAN_SHARE_TTL_MS + 1);

    expect(await vote(backend, token, "a", ["p0"])).toBe("missing");
    expect(
      await backend.query(internal.planShares.getPublicPlanShare, { token }),
    ).toBeNull();
    expect(
      await t.query(api.planShares.latestPlanShare, { spaceId }),
    ).toBeNull();
  });

  it("drops places whose save was deleted, and the link once none remain", async () => {
    const { backend, t, spaceId, itemIds, places } = await setup();
    const token = await t.mutation(api.planShares.createPlanShare, {
      spaceId,
      places,
    });
    await t.run((ctx) => ctx.db.delete(itemIds[0]));
    expect(
      await backend.query(internal.planShares.getPublicPlanShare, { token }),
    ).toMatchObject({ places: [{ key: "p1" }] });

    await t.run((ctx) => ctx.db.delete(itemIds[1]));
    expect(
      await backend.query(internal.planShares.getPublicPlanShare, { token }),
    ).toBeNull();
  });
});

describe("deletion", () => {
  async function countRows(backend: ReturnType<typeof newConvexTest>) {
    return backend.run(async (ctx) => ({
      shares: (await ctx.db.query("planShares").collect()).length,
      votes: (await ctx.db.query("planVotes").collect()).length,
    }));
  }

  it("removes a space's links and votes with the space", async () => {
    const { backend, t, spaceId, places } = await setup();
    const token = await t.mutation(api.planShares.createPlanShare, {
      spaceId,
      places,
    });
    await vote(backend, token, "a", ["p0"]);

    await t.mutation(api.spaces.deleteSpace, { id: spaceId });
    expect(await countRows(backend)).toEqual({ shares: 0, votes: 0 });
  });

  it("removes the account's links and votes with the account", async () => {
    vi.useFakeTimers();
    const { backend, t, spaceId, places } = await setup();
    const token = await t.mutation(api.planShares.createPlanShare, {
      spaceId,
      places,
    });
    await vote(backend, token, "a", ["p0"]);

    await t.mutation(api.users.deleteCurrentUserAccount, {});
    await backend.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await countRows(backend)).toEqual({ shares: 0, votes: 0 });
  });
});

describe("purgeExpiredPlanShares", () => {
  it("deletes links a week past expiry, with their votes, and keeps the rest", async () => {
    vi.useFakeTimers();
    const { backend, t, spaceId, places } = await setup();
    const old = await t.mutation(api.planShares.createPlanShare, {
      spaceId,
      places,
    });
    await vote(backend, old, "a", ["p0"]);
    vi.advanceTimersByTime(2 * PLAN_SHARE_TTL_MS + 1);
    const fresh = await t.mutation(api.planShares.createPlanShare, {
      spaceId,
      places,
    });

    await backend.mutation(internal.planShares.purgeExpiredPlanShares, {});
    const left = await backend.run(async (ctx) => ({
      tokens: (await ctx.db.query("planShares").collect()).map((s) => s.token),
      votes: (await ctx.db.query("planVotes").collect()).length,
    }));
    expect(left).toEqual({ tokens: [fresh], votes: 0 });
  });
});

describe("HTTP routes", () => {
  function postVote(
    backend: ReturnType<typeof newConvexTest>,
    body: unknown,
    secret = SECRET,
  ) {
    return backend.fetch("/plan/votes", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [WAITLIST_SECRET_HEADER]: secret,
        [WAITLIST_CLIENT_IP_HEADER]: "203.0.113.7",
      },
      body: JSON.stringify(body),
    });
  }

  it("serves a live link and 404s an unknown one", async () => {
    const { backend, t, spaceId, places } = await setup();
    const token = await t.mutation(api.planShares.createPlanShare, {
      spaceId,
      places,
    });
    const found = await backend.fetch(`/plan/shares/${token}`);
    expect(found.status).toBe(200);
    expect(await found.json()).toMatchObject({ senderName: "Priya" });
    expect((await backend.fetch("/plan/shares/nope")).status).toBe(404);
  });

  it("records a vote only from the web route", async () => {
    vi.stubEnv("WAITLIST_SHARED_SECRET", SECRET);
    const { backend, t, spaceId, places } = await setup();
    const token = await t.mutation(api.planShares.createPlanShare, {
      spaceId,
      places,
    });
    const body = { token, voterId: "a", picks: ["p0"], passes: [] };

    expect((await postVote(backend, body, "wrong")).status).toBe(401);
    expect((await postVote(backend, { ...body, picks: "p0" })).status).toBe(
      400,
    );
    expect((await postVote(backend, { ...body, voterId: "   " })).status).toBe(
      400,
    );
    expect((await postVote(backend, { ...body, token: "nope" })).status).toBe(
      404,
    );
    const ok = await postVote(backend, body);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ outcome: "recorded" });
  });
});
