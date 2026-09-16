import { httpRouter } from "convex/server";
import { isRateLimitError } from "@convex-dev/rate-limiter";
import { env, httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { auth } from "./auth";
import {
  mapRevenueCatStatus,
  parseRevenueCatEvent,
  type RevenueCatEvent,
} from "./model/revenuecat";
import {
  reconcileRevenueCatCustomers,
  reconcileRevenueCatTransfer,
} from "./model/revenuecatTransfer";
import { errorName, logEvent } from "./model/log";
import {
  bearerToken,
  generateConnectionToken,
  hashSecret,
  normalizePairingCode,
  sanitizeConnectionLabel,
} from "./model/extensionAuth";
import { isUrlPolicyError, normalizeExternalUrl } from "./model/externalUrl";
import { OPERATION_ID_MAX, OPERATION_ID_MIN } from "./items";
import { parsePaymentTelemetry } from "./model/paymentTelemetry";
import { saveErrorCode } from "./model/saveErrors";
import { secureCompare } from "./model/secureCompare";
import {
  WaitlistInputError,
  isWaitlistProduct,
  isWaitlistSource,
  joinWaitlist,
} from "./waitlist";

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
    const secret = env.REVENUECAT_WEBHOOK_SECRET;
    if (!secret) {
      return new Response("Webhook secret not configured", { status: 500 });
    }
    // Constant-time compare: a plain `!==` returns as soon as one byte
    // differs, which lets a caller time their way to the secret byte by byte.
    const authHeader = req.headers.get("authorization") ?? "";
    if (!(await secureCompare(`Bearer ${secret}`, authHeader))) {
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

    if (event.type === "TRANSFER") {
      if (
        event.eventTimestampMs === undefined ||
        !event.transferredFrom?.length ||
        !event.transferredTo?.length
      ) {
        return new Response("Invalid transfer event", { status: 400 });
      }
      try {
        await reconcileRevenueCatTransfer(
          ctx,
          event.transferredFrom,
          event.transferredTo,
          event.eventTimestampMs,
        );
      } catch {
        // Do not acknowledge a failed lookup: RevenueCat retries non-2xx deliveries.
        return new Response("Transfer reconciliation unavailable", {
          status: 503,
        });
      }
      return new Response(null, { status: 200 });
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

    const { type, userId, expiresAt, productId, periodType, eventTimestampMs } =
      event;

    if (requiresRefundReconciliation(event)) {
      try {
        await reconcileRevenueCatCustomers(ctx, [userId], eventTimestampMs);
      } catch (error) {
        logEvent("error", "revenuecat_refund_reconciliation_failed", {
          error_name: errorName(error),
        });
        return new Response("Refund reconciliation unavailable", {
          status: 503,
        });
      }
      const payment = parsePaymentTelemetry(body);
      if (payment)
        await ctx.runMutation(internal.paymentTelemetry.enqueue, { payment });
      return new Response(null, { status: 200 });
    }

    const status = mapRevenueCatStatus(type, periodType);
    await ctx.runMutation(internal.subscriptions.upsertSubscription, {
      userId,
      status,
      expiresAt: expiresAt ?? 0,
      productId,
      eventTimestampMs,
    });
    const payment = parsePaymentTelemetry(body);
    if (payment)
      await ctx.runMutation(internal.paymentTelemetry.enqueue, { payment });
    return new Response(null, { status: 200 });
  }),
});

http.route({
  path: "/health",
  method: "GET",
  handler: httpAction(async (ctx) => {
    try {
      await ctx.runQuery(internal.health.ping);
      return json({ ok: true }, 200);
    } catch (error) {
      logEvent("error", "health_check_failed", {
        error_name: errorName(error),
      });
      return json({ ok: false }, 503);
    }
  }),
});

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Header the web server uses to pass the visitor's IP along. A dedicated name
 * (rather than `x-forwarded-for`) means the value cannot be confused with
 * hops Convex's own edge adds, and it is only honoured after the shared
 * secret check below has proven the caller is our server.
 */
export const WAITLIST_CLIENT_IP_HEADER = "x-shelvr-client-ip";
export const WAITLIST_SECRET_HEADER = "x-waitlist-secret";

/**
 * Waitlist signup receiver for the marketing site. The Next.js route is the
 * only intended caller: it proves itself with `WAITLIST_SHARED_SECRET` and
 * forwards the real visitor IP, so the per-IP limiter inside `upsertSignup`
 * cannot be skipped by omitting or forging the address. The old public
 * `waitlist:join` action let any Convex client do exactly that.
 */
http.route({
  path: "/waitlist/join",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const secret = env.WAITLIST_SHARED_SECRET;
    if (!secret) {
      return json({ message: "Waitlist secret not configured." }, 500);
    }
    const provided = req.headers.get(WAITLIST_SECRET_HEADER) ?? "";
    if (!(await secureCompare(secret, provided))) {
      return json({ message: "Unauthorized." }, 401);
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json({ message: "Invalid request." }, 400);
    }
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return json({ message: "Invalid request." }, 400);
    }
    const { email, product, source } = body as Record<string, unknown>;
    if (typeof email !== "string") {
      return json({ message: "Enter a valid email address." }, 400);
    }
    if (product !== undefined && !isWaitlistProduct(product)) {
      return json({ message: "Invalid request." }, 400);
    }
    if (source !== undefined && !isWaitlistSource(source)) {
      return json({ message: "Invalid request." }, 400);
    }

    try {
      const result = await joinWaitlist(ctx, {
        email,
        product,
        source: source ?? "unknown",
        ip: req.headers.get(WAITLIST_CLIENT_IP_HEADER) ?? undefined,
      });
      return json(result, 200);
    } catch (error) {
      if (error instanceof WaitlistInputError) {
        return json({ message: error.message }, 400);
      }
      if (isRateLimitError(error)) {
        return json({ message: "Too many attempts." }, 429);
      }
      // Convex argument errors print the failing args, which include the
      // address. Log the error class only.
      logEvent("error", "waitlist_join_failed", {
        error_name: errorName(error),
      });
      return json({ message: "Could not join right now." }, 500);
    }
  }),
});

// ---------------------------------------------------------------------------
// Browser extension
// ---------------------------------------------------------------------------

/**
 * Browsers that may call the `/extension` routes cross-origin. A packed
 * extension's origin is its own id, which we cannot know ahead of time, so the
 * pattern is by scheme: only pages already running as an extension qualify,
 * never an ordinary web page.
 *
 * Echoing the origin back is safe here because these routes are bearer-only.
 * No cookie rides along (`Access-Control-Allow-Credentials` is deliberately
 * never set), so the header grants a caller nothing it could not get from a
 * plain server-side request — it exists so the extension's own popup and
 * service worker are not blocked by the browser on the way out.
 */
const EXTENSION_ORIGIN = /^(?:chrome|moz|safari-web)-extension:\/\/[\w.-]+$/i;

function extensionCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin");
  if (origin === null || !EXTENSION_ORIGIN.test(origin)) {
    return {};
  }
  // `Vary` so a cache can never serve one extension's allowance to another.
  return { "access-control-allow-origin": origin, vary: "origin" };
}

function extensionJson(
  req: Request,
  body: unknown,
  status: number,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      ...extensionCorsHeaders(req),
      ...headers,
    },
  });
}

const extensionPreflight = httpAction(async (_ctx, req) => {
  return new Response(null, {
    status: 204,
    headers: {
      ...extensionCorsHeaders(req),
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "authorization, content-type",
      "access-control-max-age": "86400",
    },
  });
});

/** Read a JSON object body, or null for anything that is not one. */
async function readJsonObject(
  req: Request,
): Promise<Record<string, unknown> | null> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return null;
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }
  return body as Record<string, unknown>;
}

/** The connection token's hash, or null when the request carries no usable
 * bearer credential. Hashing here means the plaintext token never reaches a
 * mutation, a log, or the database. */
async function connectionTokenHash(req: Request): Promise<string | null> {
  const token = bearerToken(req.headers.get("authorization"));
  return token === null ? null : await hashSecret(token);
}

// One preflight handler for all four routes: the browser sends an OPTIONS
// before any request carrying an `Authorization` header, and Convex routes
// each method explicitly.
for (const path of [
  "/extension/pair",
  "/extension/session",
  "/extension/save",
  "/extension/disconnect",
]) {
  http.route({ path, method: "OPTIONS", handler: extensionPreflight });
}

/**
 * Trade a pairing code shown in the app for this browser's connection token.
 *
 * The token is returned exactly once, here; only its hash is stored, so a lost
 * token is re-paired rather than recovered. Malformed and unknown codes answer
 * with the same `invalid_code`, differing only in status, because telling a
 * guesser that a code *exists* is most of what the code is protecting.
 */
http.route({
  path: "/extension/pair",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const body = await readJsonObject(req);
    if (body === null) {
      return extensionJson(req, { error: "invalid_request" }, 400);
    }
    const code = normalizePairingCode(body.code);
    if (code === null) {
      return extensionJson(req, { error: "invalid_code" }, 400);
    }
    const token = generateConnectionToken();
    const result = await ctx.runMutation(internal.extension.redeemPairingCode, {
      codeHash: await hashSecret(code),
      tokenHash: await hashSecret(token),
      label: sanitizeConnectionLabel(body.label),
    });
    if (result.status === "rate_limited") {
      return extensionJson(req, { error: "rate_limited" }, 429);
    }
    if (result.status === "invalid_code") {
      return extensionJson(req, { error: "invalid_code" }, 401);
    }
    return extensionJson(
      req,
      {
        token,
        label: result.label,
        connectedAt: result.connectedAt,
      },
      200,
    );
  }),
});

/** Who this browser is paired to. The extension calls it on open to confirm
 * its token still works and to show the account it saves into. */
http.route({
  path: "/extension/session",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    const tokenHash = await connectionTokenHash(req);
    if (tokenHash === null) {
      return extensionJson(req, { error: "unauthorized" }, 401);
    }
    const connection = await ctx.runQuery(
      internal.extension.describeConnection,
      { tokenHash },
    );
    if (connection === null) {
      return extensionJson(req, { error: "unauthorized" }, 401);
    }
    return extensionJson(req, connection, 200);
  }),
});

/**
 * Save the page the browser is on.
 *
 * URL policy runs here rather than in the mutation: `normalizeExternalUrl`
 * throws a plain Error, whose class and message do not survive the function
 * boundary (production redacts them), and "this page can't be saved" is worth
 * far more to the extension than a redacted 500. The refusals that DO survive
 * — `pro_required` and the rate limiter, both `ConvexError`s with structured
 * data — are caught below and mapped to a status the extension can act on.
 */
http.route({
  path: "/extension/save",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const tokenHash = await connectionTokenHash(req);
    if (tokenHash === null) {
      return extensionJson(req, { error: "unauthorized" }, 401);
    }
    const body = await readJsonObject(req);
    if (body === null || typeof body.url !== "string") {
      return extensionJson(req, { error: "invalid_request" }, 400);
    }
    // Retries of a flaky save reuse one id so a dropped response cannot become
    // a second card. Bounded against the ledger's own limits so a malformed id
    // is a 400 here, not a redacted 500 from inside the mutation.
    const { operationId } = body;
    if (
      operationId !== undefined &&
      (typeof operationId !== "string" ||
        operationId.length < OPERATION_ID_MIN ||
        operationId.length > OPERATION_ID_MAX)
    ) {
      return extensionJson(req, { error: "invalid_request" }, 400);
    }

    let url: string;
    try {
      url = normalizeExternalUrl(body.url);
    } catch (error) {
      if (isUrlPolicyError(error)) {
        return extensionJson(
          req,
          { error: "invalid_url", reason: error.code },
          400,
        );
      }
      throw error;
    }

    try {
      const result = await ctx.runMutation(internal.extension.saveLink, {
        tokenHash,
        url,
        operationId,
      });
      if (result.status === "unauthorized") {
        return extensionJson(req, { error: "unauthorized" }, 401);
      }
      return extensionJson(
        req,
        { status: result.status, itemId: result.itemId },
        200,
      );
    } catch (error) {
      if (saveErrorCode(error) === "pro_required") {
        return extensionJson(req, { error: "pro_required" }, 402);
      }
      if (isRateLimitError(error)) {
        return extensionJson(req, { error: "rate_limited" }, 429, {
          "retry-after": String(
            Math.max(1, Math.ceil(error.data.retryAfter / 1000)),
          ),
        });
      }
      // The message can echo the URL back; log the class only.
      logEvent("error", "extension_save_failed", {
        error_name: errorName(error),
      });
      return extensionJson(req, { error: "save_failed" }, 500);
    }
  }),
});

/** Unpair this browser from the extension's own side. Holding the token is
 * the authorization: it can only ever drop itself. */
http.route({
  path: "/extension/disconnect",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const tokenHash = await connectionTokenHash(req);
    if (tokenHash === null) {
      return extensionJson(req, { error: "unauthorized" }, 401);
    }
    await ctx.runMutation(internal.extension.disconnect, { tokenHash });
    return extensionJson(req, { status: "disconnected" }, 200);
  }),
});

function requiresRefundReconciliation(event: RevenueCatEvent): boolean {
  if (event.type === "REFUND_REVERSED") return true;
  if (event.type === "CANCELLATION")
    return event.cancelReason === "CUSTOMER_SUPPORT";
  if (event.type === "EXPIRATION")
    return event.expirationReason === "CUSTOMER_SUPPORT";
  return false;
}

export default http;
