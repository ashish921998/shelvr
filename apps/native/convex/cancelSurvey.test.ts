// @vitest-environment edge-runtime
import { describe, expect, it } from "vitest";
import { newConvexTest } from "./test.setup";
import { api } from "./_generated/api";

// Server-enforced "ask once per account": the row is the authority across
// devices and reinstalls, so these tests drive the mutation/query contract
// the client hook relies on — idempotent markShown, first-response-wins
// respond, and strict per-user isolation. Fresh backend per test (the
// repo convention) so rows never leak between cases.
describe("cancelSurvey", () => {
  it("reports unasked, then asked, after markShown", async () => {
    const t = newConvexTest();
    const user = t.withIdentity({ subject: "survey-user|session-1" });

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
    const user = t.withIdentity({ subject: "survey-user|session-1" });

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
    const user = t.withIdentity({ subject: "survey-user|session-1" });

    await user.mutation(api.cancelSurvey.markShown, {});
    await user.mutation(api.cancelSurvey.respond, {
      outcome: "submitted",
      reason: "too_expensive",
    });
    // A stale device (or reinstall) tries to answer again.
    await user.mutation(api.cancelSurvey.respond, { outcome: "dismissed" });

    const rows = await t.run(
      async (ctx) => await ctx.db.query("cancelSurveys").collect(),
    );
    expect(rows.length).toBe(1);
    expect(rows[0]).toMatchObject({
      userId: "survey-user",
      outcome: "submitted",
      reason: "too_expensive",
    });
  });

  it("accepts a response that arrives before markShown (offline flush order)", async () => {
    const t = newConvexTest();
    const user = t.withIdentity({ subject: "survey-user|session-1" });

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
    const user = t.withIdentity({ subject: "survey-user|session-1" });
    await user.mutation(api.cancelSurvey.markShown, {});

    const stranger = t.withIdentity({ subject: "survey-stranger|session-1" });
    expect(await stranger.query(api.cancelSurvey.getStatus, {})).toEqual({
      asked: false,
    });
    // The stranger's response creates its own row, not a patch on the first.
    await stranger.mutation(api.cancelSurvey.respond, {
      outcome: "submitted",
      reason: "other",
    });

    const rows = await t.run(
      async (ctx) => await ctx.db.query("cancelSurveys").collect(),
    );
    expect(rows.length).toBe(2);
    const userRow = rows.find((row) => row.userId === "survey-user");
    const strangerRow = rows.find((row) => row.userId === "survey-stranger");
    // The stranger's response created its own row; the first user's ask is
    // untouched (no outcome yet).
    expect(userRow).toBeDefined();
    expect(userRow?.outcome).toBeUndefined();
    expect(strangerRow).toMatchObject({
      outcome: "submitted",
      reason: "other",
    });
  });

  it("bounds the reason to the survey's ids — free text is rejected", async () => {
    const t = newConvexTest();
    const user = t.withIdentity({ subject: "survey-user|session-1" });
    await user.mutation(api.cancelSurvey.markShown, {});

    await expect(
      user.mutation(api.cancelSurvey.respond, {
        outcome: "submitted",
        // Deliberately invalid: the validator must reject it at runtime.
        // @ts-expect-error — the point of the test is the runtime rejection
        reason: "because the app crashed when I opened it",
      }),
    ).rejects.toThrow();
  });
});
