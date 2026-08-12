import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { auth } from "./auth";
import { mapRevenueCatStatus, parseRevenueCatEvent } from "./model/revenuecat";

const http = httpRouter();

// Convex Auth: JWT verification, JWKS, and OAuth callback HTTP actions.
auth.addHttpRoutes(http);

/**
 * RevenueCat webhook receiver. RevenueCat posts server-to-server events here
 * for every subscription lifecycle change (trial start, conversion, renewal,
 * cancellation, expiration). We authenticate with a shared bearer secret set
 * in the RevenueCat dashboard and stored in the `REVENUECAT_WEBHOOK_SECRET`
 * Convex deployment env var, then map the event to an entitlement row.
 *
 * The Convex Auth user id is configured as the RevenueCat app user id (the
 * client calls `Purchases.logIn(convexUserId)` on sign-in), so the event's
 * current `app_user_id` is the same `userId` every other table keys on — no
 * client-supplied id is trusted.
 */
http.route({
  path: "/webhooks/revenuecat",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const secret = process.env.REVENUECAT_WEBHOOK_SECRET;
    if (!secret) {
      return new Response("Webhook secret not configured", { status: 500 });
    }
    const authHeader = req.headers.get("authorization") ?? "";
    if (authHeader !== `Bearer ${secret}`) {
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

    // A readable event missing required identity or ordering fields is
    // malformed but acknowledged — return 200 so RevenueCat stops retrying a
    // non-actionable event rather than hammering the endpoint.
    if (
      event.type === undefined ||
      event.userId === undefined ||
      event.eventTimestampMs === undefined
    ) {
      return new Response(null, { status: 200 });
    }

    const { type, userId, expiresAt, productId, periodType, eventTimestampMs } = event;

    // Lifetime-ness is decided once, here at the edge, from the product id —
    // not re-derived in the handler. A lifetime purchase carries
    // `status: "lifetime"` into upsertSubscription; every other event is mapped
    // by type. Events that preserve the existing status (CANCELLATION, etc.)
    // pass `status: undefined` so upsertSubscription keeps the current status
    // transactionally — no separate read here that could race with a concurrent
    // event.
    const status =
      productId !== undefined && isLifetimeProduct(productId)
        ? "lifetime"
        : mapRevenueCatStatus(type, periodType);
    await ctx.runMutation(internal.subscriptions.upsertSubscription, {
      userId,
      status,
      expiresAt: expiresAt ?? 0,
      productId,
      eventTimestampMs,
    });
    return new Response(null, { status: 200 });
  }),
});

/**
 * Product ids (as configured in RevenueCat) that grant a lifetime (permanent,
 * non-expiring) entitlement instead of a time-limited subscription. Add a
 * product id here when you create a new lifetime product in RevenueCat.
 */
const LIFETIME_PRODUCT_IDS = new Set<string>(["lifetime"]);

function isLifetimeProduct(productId: string): boolean {
  return LIFETIME_PRODUCT_IDS.has(productId);
}

export default http;
