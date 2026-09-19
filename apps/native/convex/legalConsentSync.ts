import { v } from "convex/values";
import { internal } from "./_generated/api";
import { env, internalAction, internalMutation } from "./_generated/server";
import {
  CONSENT_SYNC_LEASE_MS,
  REFUND_CONSENT_ATTRIBUTE,
  REFUND_CONSENT_VERSION_ATTRIBUTE,
  TERMS_VERSION,
} from "./model/legalConsent";
import { errorName, logEvent } from "./model/log";

const claimValidator = v.object({
  userId: v.id("users"),
  revision: v.number(),
  lease: v.number(),
  allowed: v.boolean(),
  deleting: v.boolean(),
  changedAt: v.number(),
});

export const claim = internalMutation({
  args: { id: v.id("legalConsents") },
  returns: v.union(v.null(), claimValidator),
  handler: async (ctx, { id }) => {
    const row = await ctx.db.get(id);
    if (!row || row.syncState !== "pending" || row.nextSyncAt > Date.now())
      return null;
    const lease = Date.now() + CONSENT_SYNC_LEASE_MS;
    await ctx.db.patch(id, { syncState: "syncing", nextSyncAt: lease });
    const owner = await ctx.db.get(row.userId);
    return {
      userId: row.userId,
      revision: row.revision,
      lease,
      changedAt: row.changedAt,
      deleting: !!row.deleting || !owner,
      allowed:
        !!owner &&
        !row.deleting &&
        row.refundSharing &&
        row.acceptedVersion === TERMS_VERSION,
    };
  },
});

export const finish = internalMutation({
  args: {
    id: v.id("legalConsents"),
    revision: v.number(),
    lease: v.number(),
    success: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, { id, revision, lease, success }) => {
    const row = await ctx.db.get(id);
    if (!row || row.syncState !== "syncing" || row.nextSyncAt !== lease)
      return null;
    if (row.revision === revision && success) {
      if (row.deleting) await ctx.db.delete(id);
      else await ctx.db.patch(id, { syncState: "synced", attempts: 0 });
      return null;
    }
    const attempts = row.revision === revision ? row.attempts + 1 : 0;
    const delay =
      attempts === 0
        ? 0
        : Math.min(3_600_000, 1000 * 2 ** Math.min(attempts, 12));
    await ctx.db.patch(id, {
      syncState: "pending",
      attempts,
      nextSyncAt: Date.now() + delay,
    });
    await ctx.scheduler.runAfter(delay, internal.legalConsentSync.send, { id });
    return null;
  },
});

export const send = internalAction({
  args: { id: v.id("legalConsents") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const snapshot = await ctx.runMutation(internal.legalConsentSync.claim, {
      id,
    });
    if (!snapshot) return null;
    let success = false;
    try {
      if (!env.REVENUECAT_API_KEY) throw new Error("RevenueCat key missing");
      const customerUrl = `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(snapshot.userId)}`;
      const request = {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.REVENUECAT_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          attributes: {
            [REFUND_CONSENT_ATTRIBUTE]: {
              value: String(snapshot.allowed),
              updated_at_ms: snapshot.changedAt,
            },
            [REFUND_CONSENT_VERSION_ATTRIBUTE]: {
              value: snapshot.allowed ? TERMS_VERSION : "",
              updated_at_ms: snapshot.changedAt,
            },
          },
        }),
      };
      const post = () =>
        fetch(`${customerUrl}/attributes`, {
          ...request,
          signal: AbortSignal.timeout(10_000),
        });
      let response = await post();
      if (response.status === 404 && !snapshot.deleting) {
        // Consent can arrive before the SDK has registered this customer.
        const customer = await fetch(customerUrl, {
          headers: { Authorization: `Bearer ${env.REVENUECAT_API_KEY}` },
          signal: AbortSignal.timeout(10_000),
        });
        if (!customer.ok)
          throw new Error("RevenueCat customer creation failed");
        response = await post();
      }
      if (response.status === 404 && snapshot.deleting) {
        // A missing customer has no attributes to revoke. Never recreate a
        // RevenueCat profile while cleaning up a deleted Shelvr account.
        success = true;
      } else {
        if (!response.ok) throw new Error("RevenueCat consent sync rejected");
        success = true;
      }
    } catch (error) {
      logEvent("error", "refund_consent_sync_failed", {
        error_name: errorName(error),
      });
    }
    await ctx.runMutation(internal.legalConsentSync.finish, {
      id,
      revision: snapshot.revision,
      lease: snapshot.lease,
      success,
    });
    return null;
  },
});
