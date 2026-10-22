// @vitest-environment edge-runtime
import { describe, expect, it } from "vitest";
import { newConvexTest, signedInUser } from "./test.setup";
import { api } from "./_generated/api";

describe("cancelSurvey", () => {
  it("reports unasked, then asked, after markShown", async () => {
    const t = newConvexTest();
    const { t: user } = await signedInUser(t);

    expect(await user.query(api.cancelSurvey.getStatus, {})).toEqual({
      asked: false,
    });

    await user.mutation(api.cancelSurvey.markShown, {});

    expect(await user.query(api.cancelSurvey.getStatus, {})).toEqual({
      asked: true,
    });
  });

  it("markShown is idempotent — the ask is consumed exactly once, and the loser is told so", async () => {
    const t = newConvexTest();
    const { t: user } = await signedInUser(t);

    const first = await user.mutation(api.cancelSurvey.markShown, {});
    const second = await user.mutation(api.cancelSurvey.markShown, {});
    expect(first).toEqual({ accepted: true });
    expect(second).toEqual({ accepted: false });

    const rowsFor = () =>
      t.run(async (ctx) => await ctx.db.query("cancelSurveys").collect());

    expect((await rowsFor()).length).toBe(1);
  });

  it("first response wins; a stale second response is ignored", async () => {
    const t = newConvexTest();
    const { t: user, userId } = await signedInUser(t);

    await user.mutation(api.cancelSurvey.markShown, {});
    await user.mutation(api.cancelSurvey.respond, {
      outcome: "submitted",
      reason: "too_expensive",
    });
    await user.mutation(api.cancelSurvey.respond, { outcome: "dismissed" });

    const rows = await t.run(
      async (ctx) => await ctx.db.query("cancelSurveys").collect(),
    );
    expect(rows.length).toBe(1);
    expect(rows[0]).toMatchObject({
      userId,
      outcome: "submitted",
      reason: "too_expensive",
    });
  });

  it("accepts a response that arrives before markShown (offline flush order)", async () => {
    const t = newConvexTest();
    const { t: user } = await signedInUser(t);

    const result = await user.mutation(api.cancelSurvey.respond, {
      outcome: "dismissed",
    });
    expect(result).toEqual({ accepted: true });

    const rows = await t.run(
      async (ctx) => await ctx.db.query("cancelSurveys").collect(),
    );
    expect(rows.length).toBe(1);
    expect(rows[0]).toMatchObject({
      outcome: "dismissed",
      askedAt: expect.any(Number),
    });
  });

  it("never lets one user read or spend another user's ask", async () => {
    const t = newConvexTest();
    const { t: user, userId } = await signedInUser(t);
    await user.mutation(api.cancelSurvey.markShown, {});

    const { t: stranger, userId: strangerId } = await signedInUser(t);
    expect(await stranger.query(api.cancelSurvey.getStatus, {})).toEqual({
      asked: false,
    });
    await stranger.mutation(api.cancelSurvey.respond, {
      outcome: "submitted",
      reason: "other",
    });

    const rows = await t.run(
      async (ctx) => await ctx.db.query("cancelSurveys").collect(),
    );
    expect(rows.length).toBe(2);
    const userRow = rows.find((row) => row.userId === userId);
    const strangerRow = rows.find((row) => row.userId === strangerId);
    expect(userRow).toBeDefined();
    expect(userRow?.outcome).toBeUndefined();
    expect(strangerRow).toMatchObject({
      outcome: "submitted",
      reason: "other",
    });
  });

  it("bounds the reason to the survey's ids — free text is rejected", async () => {
    const t = newConvexTest();
    const { t: user } = await signedInUser(t);
    await user.mutation(api.cancelSurvey.markShown, {});

    await expect(
      user.mutation(api.cancelSurvey.respond, {
        outcome: "submitted",
        // @ts-expect-error
        reason: "because the app crashed when I opened it",
      }),
    ).rejects.toThrow();
  });
});
