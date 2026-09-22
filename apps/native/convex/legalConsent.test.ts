// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { newConvexTest } from "./test.setup";
import { CONSENT_SYNC_LEASE_MS, TERMS_VERSION } from "./model/legalConsent";
import { MAX_SYNC_ATTEMPTS } from "./legalConsentSync";

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("REVENUECAT_API_KEY", "test-api-key");
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
async function fixture() {
  const t = newConvexTest();
  const userId = await t.run((ctx) => ctx.db.insert("users", {}));
  const signedIn = t.withIdentity({ subject: `${userId}|session` });
  const row = () =>
    t.run((ctx) =>
      ctx.db
        .query("legalConsents")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .unique(),
    );
  const review = (accepted: boolean) =>
    signedIn.mutation(api.legalConsent.review, {
      version: TERMS_VERSION,
      accepted,
    });
  const send = async () => {
    const consent = await row();
    if (!consent) throw new Error("Missing fixture consent");
    await t.action(internal.legalConsentSync.send, { id: consent._id });
  };
  return { t, userId, signedIn, row, review, send };
}
function mockRevenueCat() {
  const fetchMock = vi.fn().mockImplementation(async () => Response.json({}));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("recorded terms and refund consent", () => {
  it("requires authentication and never infers consent for existing accounts", async () => {
    const f = await fixture();
    await expect(
      f.t.mutation(api.legalConsent.review, {
        version: TERMS_VERSION,
        accepted: true,
      }),
    ).rejects.toThrow();
    await expect(f.t.query(api.legalConsent.get, {})).rejects.toThrow();
    expect(await f.signedIn.query(api.legalConsent.get, {})).toBeNull();
    expect(await f.row()).toBeNull();
  });
  it("records the accepted version and server time idempotently", async () => {
    const f = await fixture();
    const now = Date.now();
    await f.review(true);
    const first = await f.row();
    expect(first).toMatchObject({
      userId: f.userId,
      acceptedVersion: TERMS_VERSION,
      acceptedAt: now,
      refundSharing: true,
      syncState: "pending",
      changedAt: now,
    });
    vi.setSystemTime(now + 1000);
    await f.review(true);
    expect(await f.row()).toEqual(first);
    expect(await f.signedIn.query(api.legalConsent.get, {})).toMatchObject({
      syncPending: true,
      refundSharing: true,
    });
  });
  it("keeps decision timestamps increasing when the clock moves backwards", async () => {
    const f = await fixture();
    const now = Date.now();
    await f.review(true);
    vi.setSystemTime(now - 1000);
    await f.signedIn.mutation(api.legalConsent.withdraw, {});
    expect((await f.row())?.changedAt).toBe(now + 1);
    await f.review(true);
    expect((await f.row())?.changedAt).toBe(now + 2);
  });
  it("rejects unsupported terms versions and a client-supplied identity", async () => {
    const f = await fixture();
    await expect(
      f.signedIn.mutation(api.legalConsent.review, {
        // @ts-expect-error Runtime validation must also reject an obsolete client.
        version: "old",
        accepted: true,
      }),
    ).rejects.toThrow();
    await expect(
      f.signedIn.mutation(api.legalConsent.review, {
        version: TERMS_VERSION,
        accepted: true,
        // @ts-expect-error Public API has no userId argument.
        userId: f.userId,
      }),
    ).rejects.toThrow();
    expect(await f.row()).toBeNull();
  });
  it.each([true, false])(
    "syncs only explicit eligibility for decision %s",
    async (accepted) => {
      const f = await fixture();
      const fetchMock = mockRevenueCat();
      await f.review(accepted);
      await f.send();
      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, request] = fetchMock.mock.calls[0];
      expect(url).toBe(
        `https://api.revenuecat.com/v1/subscribers/${f.userId}/attributes`,
      );
      expect(request.method).toBe("POST");
      expect(JSON.parse(request.body)).toEqual({
        attributes: {
          apple_refund_consent: {
            value: String(accepted),
            updated_at_ms: Date.now(),
          },
          apple_refund_consent_version: {
            value: accepted ? TERMS_VERSION : "",
            updated_at_ms: Date.now(),
          },
        },
      });
      expect(await f.signedIn.query(api.legalConsent.get, {})).toMatchObject({
        reviewedVersion: TERMS_VERSION,
        refundSharing: accepted,
        syncPending: false,
      });
      if (!accepted) expect((await f.row())?.acceptedVersion).toBeUndefined();
    },
  );
  it("isolates decisions across accounts", async () => {
    const f = await fixture();
    await f.review(true);
    const otherId = await f.t.run((ctx) => ctx.db.insert("users", {}));
    const other = f.t.withIdentity({ subject: `${otherId}|session` });
    expect(await other.query(api.legalConsent.get, {})).toBeNull();
    await other.mutation(api.legalConsent.withdraw, {});
    expect((await f.row())?.refundSharing).toBe(true);
  });
  it("withdraws sharing while retaining the accepted terms receipt", async () => {
    const f = await fixture();
    const fetchMock = mockRevenueCat();
    await f.review(true);
    await f.send();
    const accepted = await f.row();
    await f.signedIn.mutation(api.legalConsent.withdraw, {});
    expect(await f.row()).toMatchObject({
      refundSharing: false,
      acceptedVersion: TERMS_VERSION,
      acceptedAt: accepted?.acceptedAt,
      syncState: "pending",
    });
    await f.send();
    expect(
      JSON.parse(fetchMock.mock.calls[1][1].body).attributes
        .apple_refund_consent.value,
    ).toBe("false");
    expect((await f.row())?.syncState).toBe("synced");
  });
});

describe("consent delivery reliability", () => {
  it.each(["before_claim", "during_send"])(
    "revokes and removes orphaned consent when the owner disappears %s",
    async (when) => {
      const f = await fixture();
      await f.review(true);
      const grant = await f.row();
      if (when === "before_claim")
        await f.t.run((ctx) => ctx.db.delete(f.userId));
      const fetchMock = vi
        .fn()
        .mockImplementationOnce(async () => {
          if (when === "during_send")
            await f.t.run((ctx) => ctx.db.delete(f.userId));
          return Response.json({});
        })
        .mockImplementation(async () => Response.json({}));
      vi.stubGlobal("fetch", fetchMock);
      await f.send();
      if (when === "during_send") {
        expect(await f.row()).toMatchObject({
          syncState: "pending",
        });
        await f.send();
      }
      const attributes = JSON.parse(
        fetchMock.mock.calls.at(-1)![1].body,
      ).attributes;
      expect(attributes.apple_refund_consent.value).toBe("false");
      expect(attributes.apple_refund_consent.updated_at_ms).toBeGreaterThan(
        grant!.changedAt,
      );
      expect(await f.row()).toBeNull();
    },
  );

  it("registers a customer when consent precedes the SDK login", async () => {
    const f = await fixture();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(Response.json({ subscriber: {} }))
      .mockResolvedValueOnce(Response.json({}));
    vi.stubGlobal("fetch", fetchMock);
    await f.review(true);
    await f.send();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1][0]).toBe(
      `https://api.revenuecat.com/v1/subscribers/${f.userId}`,
    );
    expect((await f.row())?.syncState).toBe("synced");
  });

  it("finishes deletion without recreating a missing RevenueCat customer", async () => {
    const f = await fixture();
    await f.review(true);
    await f.signedIn.mutation(api.users.deleteCurrentUserAccount, {});
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);
    await f.send();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(await f.row()).toBeNull();
  });

  it.each([401, 429, 503])(
    "retries HTTP %s without claiming the preference is synced",
    async (status) => {
      const f = await fixture();
      vi.spyOn(console, "error").mockImplementation(() => {});
      const fetchMock = vi
        .fn()
        .mockImplementation(async () => new Response(null, { status }));
      vi.stubGlobal("fetch", fetchMock);
      await f.review(true);
      await f.send();
      expect(await f.row()).toMatchObject({
        syncState: "pending",
        attempts: 1,
      });
      await f.send();
      expect(fetchMock).toHaveBeenCalledOnce();
      vi.setSystemTime(Date.now() + 2000);
      fetchMock.mockImplementation(async () => Response.json({}));
      await f.send();
      expect((await f.row())?.syncState).toBe("synced");
    },
  );
  it("keeps missing credentials and network failures retryable", async () => {
    const f = await fixture();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = vi.fn().mockRejectedValue(new Error("private response"));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("REVENUECAT_API_KEY", "");
    await f.review(true);
    await f.send();
    expect(fetchMock).not.toHaveBeenCalled();
    vi.stubEnv("REVENUECAT_API_KEY", "test-api-key");
    vi.setSystemTime(Date.now() + 2000);
    await f.send();
    expect((await f.row())?.syncState).toBe("pending");
  });
  it("caps repeated failures as failed and revives on the next decision", async () => {
    const f = await fixture();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = vi.fn().mockRejectedValue(new Error("rc_down"));
    vi.stubGlobal("fetch", fetchMock);
    await f.review(true);
    for (let attempt = 0; attempt < MAX_SYNC_ATTEMPTS; attempt++) {
      if (attempt > 0) vi.setSystemTime(Date.now() + 3_600_000);
      await f.send();
    }
    expect(await f.row()).toMatchObject({
      syncState: "failed",
      attempts: MAX_SYNC_ATTEMPTS,
    });
    expect(await f.signedIn.query(api.legalConsent.get, {})).toMatchObject({
      syncPending: true,
      syncFailed: true,
    });
    // The recovery cron skips capped rows instead of rescheduling forever.
    await f.t.mutation(internal.legalConsent.retry, {});
    expect(await f.row()).toMatchObject({
      syncState: "failed",
      attempts: MAX_SYNC_ATTEMPTS,
    });
    // A fresh decision revives the row with a clean attempt budget.
    vi.setSystemTime(Date.now() + 3_600_000);
    fetchMock.mockImplementation(async () => Response.json({}));
    await f.review(false);
    expect(await f.row()).toMatchObject({ syncState: "pending", attempts: 0 });
    await f.send();
    expect((await f.row())?.syncState).toBe("synced");
    expect(await f.signedIn.query(api.legalConsent.get, {})).toMatchObject({
      syncPending: false,
      syncFailed: false,
    });
  });
  it("never caps deletion withdrawals, which no user action can revive", async () => {
    const f = await fixture();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = vi.fn().mockRejectedValue(new Error("rc_down"));
    vi.stubGlobal("fetch", fetchMock);
    await f.review(true);
    const row = await f.row();
    if (!row) throw new Error("Missing fixture consent");
    await f.t.run((ctx) =>
      ctx.db.patch(row._id, {
        deleting: true,
        syncState: "pending",
        attempts: 0,
        nextSyncAt: Date.now(),
      }),
    );
    for (let attempt = 0; attempt <= MAX_SYNC_ATTEMPTS; attempt++) {
      if (attempt > 0) vi.setSystemTime(Date.now() + 3_600_000);
      await f.send();
    }
    expect(await f.row()).toMatchObject({
      deleting: true,
      syncState: "pending",
      attempts: MAX_SYNC_ATTEMPTS + 1,
    });
  });
  it("serializes a withdrawal behind an in-flight grant and ignores duplicate workers", async () => {
    const f = await fixture();
    await f.review(true);
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(async () => {
        await f.signedIn.mutation(api.legalConsent.withdraw, {});
        await f.send();
        return Response.json({});
      })
      .mockImplementation(async () => Response.json({}));
    vi.stubGlobal("fetch", fetchMock);
    await f.send();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(await f.row()).toMatchObject({
      refundSharing: false,
      syncState: "pending",
      changedAt: Date.now() + 1,
    });
    await f.send();
    expect(
      JSON.parse(fetchMock.mock.calls[1][1].body).attributes
        .apple_refund_consent.value,
    ).toBe("false");
    expect((await f.row())?.syncState).toBe("synced");
  });
  it("recovers an abandoned action after its runtime limit and rejects stale completions", async () => {
    const f = await fixture();
    mockRevenueCat();
    await f.review(true);
    const row = await f.row();
    if (!row) throw new Error("Missing consent");
    const first = await f.t.mutation(internal.legalConsentSync.claim, {
      id: row._id,
    });
    if (!first) throw new Error("Missing claim");
    await f.t.mutation(internal.legalConsent.retry, {});
    expect((await f.row())?.syncState).toBe("syncing");
    vi.setSystemTime(Date.now() + CONSENT_SYNC_LEASE_MS + 1);
    await f.t.mutation(internal.legalConsent.retry, {});
    const second = await f.t.mutation(internal.legalConsentSync.claim, {
      id: row._id,
    });
    if (!second) throw new Error("Missing second claim");
    await f.t.mutation(internal.legalConsentSync.finish, {
      id: row._id,
      changedAt: first.changedAt,
      lease: first.lease,
      success: true,
    });
    expect((await f.row())?.syncState).toBe("syncing");
    await f.t.mutation(internal.legalConsentSync.finish, {
      id: row._id,
      changedAt: second.changedAt,
      lease: second.lease,
      success: true,
    });
    expect((await f.row())?.syncState).toBe("synced");
  });
  it("revokes after account deletion and removes the consent record only after delivery", async () => {
    const f = await fixture();
    const fetchMock = mockRevenueCat();
    await f.review(true);
    await f.send();
    await f.signedIn.mutation(api.users.deleteCurrentUserAccount, {});
    expect(await f.t.run((ctx) => ctx.db.get(f.userId))).toBeNull();
    expect(await f.row()).toMatchObject({
      refundSharing: false,
      deleting: true,
      syncState: "pending",
    });
    await f.send();
    expect(
      JSON.parse(fetchMock.mock.calls[1][1].body).attributes
        .apple_refund_consent.value,
    ).toBe("false");
    expect(await f.row()).toBeNull();
  });
});
