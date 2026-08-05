import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

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
      return new Response("Bad payload", { status: 400 });
    }
    const event = readRecord(readRecord(body)?.event);
    const type = readString(event?.type);
    // The client logs in to RevenueCat with the Clerk user id, which RevenueCat
    // sends as the current app_user_id. original_app_user_id may still be an
    // anonymous pre-login alias, so it must not be used as our ownership key.
    const userId = readString(event?.app_user_id);
    const expiresAt = readNumber(event?.expiration_at_ms);
    const productId = readString(event?.product_id);

    if (type === undefined || userId === undefined || expiresAt === undefined) {
      return new Response("Bad payload", { status: 400 });
    }

    const status = mapStatus(type);

    // Events that preserve the existing status (CANCELLATION, etc.) still
    // refresh `expiresAt` so the row tracks the current period end. Resolve the
    // current status server-side so the mutation doesn't have to parse webhook
    // semantics.
    if (status === null) {
      const current = await ctx.runQuery(
        internal.subscriptions.getSubscriptionInternal,
        { userId },
      );
      await ctx.runMutation(internal.subscriptions.upsertSubscription, {
        userId,
        // Let upsert keep the existing status (or default to pro for a first
        // event that arrived without a status signal).
        status: current?.status,
        expiresAt,
        productId,
      });
      return new Response(null, { status: 200 });
    }

    await ctx.runMutation(internal.subscriptions.upsertSubscription, {
      userId,
      status,
      expiresAt,
      productId,
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

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

export default http;
