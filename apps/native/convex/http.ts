import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { parseRevenueCatEvent } from "./model/revenuecat";

const http = httpRouter();

/**
 * RevenueCat webhook receiver. RevenueCat posts server-to-server events here
 * for every subscription lifecycle change (trial start, conversion, renewal,
 * cancellation, expiration). We authenticate with a shared bearer secret set
 * in the RevenueCat dashboard and stored in the `REVENUECAT_WEBHOOK_SECRET`
 * Convex deployment env var, then map the event to an entitlement row.
 *
 * The Clerk `sub` is configured as the RevenueCat app user id (the client calls
 * `Purchases.logIn(clerkSub)` on sign-in), so the event's current `app_user_id`
 * is the same `userId` every other table keys on — no client-supplied id is
 * trusted.
 */
http.route({
  path: "/webhooks/revenuecat",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const secret = process.env.REVENUECAT_WEBHOOK_SECRET;
    if (!secret) {
      return new Response("Webhook secret not configured", { status: 500 });
    }
    const auth = req.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${secret}`) {
      return new Response("Unauthorized", { status: 401 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      // Unreadable/non-JSON body — RevenueCat should not retry these.
      return new Response("Bad payload", { status: 400 });
    }
    const event = parseRevenueCatEvent(body);
    if (event === undefined) {
      // Body was not a readable object — reject so RevenueCat doesn't retry.
      return new Response("Bad payload", { status: 400 });
    }

    // A readable event missing required fields (type or app_user_id) is
    // malformed but acknowledged — return 200 so RevenueCat stops retrying
    // a non-actionable event rather than hammering the endpoint.
    if (event.type === undefined || event.userId === undefined) {
      return new Response(null, { status: 200 });
    }

    const { type, userId, expiresAt, productId, eventTimestampMs } = event;
    const status = mapStatus(type);

    // Events that preserve the existing status (CANCELLATION, etc.) pass
    // `status: undefined` so upsertSubscription keeps the current status
    // transactionally — no separate read here that could race with a
    // concurrent event.
    await ctx.runMutation(internal.subscriptions.upsertSubscription, {
      userId,
      status: status ?? undefined,
      expiresAt: expiresAt ?? 0,
      productId,
      eventTimestampMs,
    });
    return new Response(null, { status: 200 });
  }),
});

/**
 * Map a RevenueCat `notification_type` to an entitlement status, or `null`
 * when the event should preserve the existing status (e.g. CANCELLATION, which
 * only signals the user turned off auto-renew — they keep access until the
 * period ends, at which point a separate EXPIRATION event flips them to lapsed).
 *
 * The trial/pro distinction is advisory only — both are `entitled` for gating.
 * INITIAL_PURCHASE is treated as `trialing` because the only entry point into
 * Shelvr is the 7-day introductory trial; a direct paid purchase (no trial)
 * would still be entitled, just labeled `trialing` until the next event.
 */
function mapStatus(type: string): "trialing" | "pro" | "lapsed" | null {
  switch (type) {
    case "INITIAL_PURCHASE":
    case "TRIAL_STARTED":
      return "trialing";
    case "TRIAL_CONVERTED":
    case "RENEWAL":
    case "PRODUCT_CHANGE":
    case "UNCANCELLATION":
      return "pro";
    case "EXPIRATION":
      return "lapsed";
    // CANCELLATION, SUBSCRIPTION_PAUSED, BILLING_ISSUE_DETECTED, etc. preserve
    // the current status; the row's expiresAt is still refreshed by the caller.
    default:
      return null;
  }
}

export default http;
