import { httpRouter } from "convex/server";
import { isRateLimitError } from "@convex-dev/rate-limiter";
import { env, httpAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { auth } from "./auth";
import {
  mapRevenueCatStatus,
  parseRevenueCatEvent,
  resolveExpiresAt,
  type RevenueCatEvent,
} from "./model/revenuecat";
import {
  reconcileRevenueCatCustomers,
  reconcileRevenueCatTransfer,
} from "./model/revenuecatTransfer";
import { bearerToken, sha256Hex } from "./model/captureTokens";
import {
  parseImageBegin,
  parseImageFinish,
  parseLinkOrNote,
  readBoundedText,
  readBoundedBlob,
  BodyTooLargeError,
} from "./model/captureRequest";
import { isUrlPolicyError, normalizeExternalUrl } from "./model/externalUrl";
import { errorName, logEvent } from "./model/log";
import { parseOracleInput } from "./model/oracle";
import { parsePaymentTelemetry } from "./model/paymentTelemetry";
import { APPLE_ROOT_CA_G3 } from "./model/appleJws";
import { answerRetentionRequest } from "./model/retentionMessaging";
import { saveErrorCode } from "./model/saveErrors";
import {
  MAX_STORED_IMAGE_BYTES,
  imageSizeErrorCode,
} from "./model/imagePolicy";
import { secureCompare } from "./model/secureCompare";
import {
  WaitlistInputError,
  isWaitlistProduct,
  isWaitlistSource,
  joinWaitlist,
} from "./waitlist";

const http = httpRouter();

http.route({
  path: "/image-upload",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const response = await receiveImageUpload(ctx, req);
    response.headers.set("access-control-allow-origin", "*");
    return response;
  }),
});

http.route({
  path: "/image-upload",
  method: "OPTIONS",
  handler: httpAction(
    async () =>
      new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "POST",
          "access-control-allow-headers": "content-type",
          "access-control-max-age": "600",
        },
      }),
  ),
});

async function receiveImageUpload(
  ctx: ActionCtx,
  req: Request,
): Promise<Response> {
  const token = new URL(req.url).searchParams.get("token");
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return captureUnauthorized();
  let claim:
    | {
        kind: "accept";
        operationId: import("./_generated/dataModel").Id<"itemOperations">;
        claimTime: number;
      }
    | undefined;
  try {
    const result = await ctx.runMutation(internal.items.claimImageUpload, {
      tokenHash: await sha256Hex(token),
    });
    if (result.kind === "reject") return captureUnauthorized();
    if (result.kind === "busy") {
      const response = json({ error: "rate_limited" }, 429);
      response.headers.set("retry-after", "60");
      return response;
    }
    if (result.kind === "stored") {
      // This capability already has its immutable receipt. Do not parse or
      // cancel the irrelevant retry body: cancellation resets HTTP/2, and
      // revalidation could incorrectly refuse an upload already accepted.
      return json({ storageId: result.storageId }, 200);
    }
    claim = result;
    const blob = await readBoundedBlob(req, MAX_STORED_IMAGE_BYTES);
    const sizeError = imageSizeErrorCode(blob.size);
    if (sizeError) return json({ error: sizeError }, 422);
    const storageId = await ctx.storage.store(blob);
    const attached = await ctx.runMutation(internal.items.finishImageUpload, {
      operationId: result.operationId,
      claimTime: result.claimTime,
      storageId,
    });
    claim = undefined;
    return attached
      ? json({ storageId }, 200)
      : json({ error: "bad_request" }, 409);
  } catch (error) {
    if (error instanceof BodyTooLargeError)
      return json({ error: "image_too_large" }, 413);
    return captureFailure("image_begin", error);
  } finally {
    if (claim)
      await ctx.runMutation(internal.items.finishImageUpload, {
        operationId: claim.operationId,
        claimTime: claim.claimTime,
      });
  }
}

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

    const { type, userId, productId, periodType, eventTimestampMs } = event;

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
      expiresAt: resolveExpiresAt(event),
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
 * Apple's Get Retention Message endpoint. The App Store posts a signed request
 * while a subscriber views the page where they can cancel, and the reply picks
 * the message shown on the cancel sheet. The request is authenticated by its
 * signature alone, so there is no shared secret. Apple allows 700 ms, which is
 * why this reads no database.
 */
http.route({
  path: "/retention-messaging",
  method: "POST",
  handler: httpAction(async (_ctx, req) => {
    const reply = await answerRetentionRequest(await req.text(), {
      root: APPLE_ROOT_CA_G3,
      now: Date.now(),
      messageId: env.APPLE_RETENTION_MESSAGE_ID,
    });
    if (reply.reason)
      logEvent("warn", "retention_request_rejected", { reason: reply.reason });
    return json(reply.body, reply.status);
  }),
});

/** The marketing server claims a bounded parsing budget before reading the
 * visitor's request. No visitor body is accepted by this endpoint. */
http.route({
  path: "/request-body",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const secret = env.WAITLIST_SHARED_SECRET;
    if (
      !secret ||
      !(await secureCompare(secret, req.headers.get("x-waitlist-secret") ?? ""))
    )
      return json({ error: "unauthorized" }, 401);
    const route = req.headers.get("x-shelvr-body-route");
    if (route !== "oracle" && route !== "waitlist")
      return json({ error: "bad_request" }, 400);
    try {
      await ctx.runMutation(internal.oracleLimits.claimRequestBody, {
        route,
        ip: req.headers.get("x-shelvr-client-ip") ?? undefined,
      });
      return json({ ok: true }, 200);
    } catch (error) {
      if (isRateLimitError(error)) return json({ error: "rate_limited" }, 429);
      logEvent("error", "request_body_claim_failed", {
        error_name: errorName(error),
      });
      return json({ error: "failed" }, 500);
    }
  }),
});

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
      body = JSON.parse(await readBoundedText(req, 4096));
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

/**
 * The marketing site's no-login oracle. Same caller and trust model as
 * `/waitlist/join`: the Next.js route proves itself with the waitlist secret
 * and forwards the visitor IP for the per-IP limiter. The body is narrowed
 * before a token is spent, so a malformed request costs the visitor nothing.
 */
http.route({
  path: "/oracle",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const secret = env.WAITLIST_SHARED_SECRET;
    if (!secret) {
      return json({ message: "Oracle secret not configured." }, 500);
    }
    const provided = req.headers.get(WAITLIST_SECRET_HEADER) ?? "";
    if (!(await secureCompare(secret, provided))) {
      return json({ message: "Unauthorized." }, 401);
    }

    let body: unknown;
    try {
      body = JSON.parse(await readBoundedText(req, 6 * 1024 * 1024));
    } catch {
      return json({ message: "Invalid request." }, 400);
    }
    const input = parseOracleInput(body);
    if (!input) {
      return json({ message: "Invalid request." }, 400);
    }

    try {
      await ctx.runMutation(internal.oracleLimits.claim, {
        ip: req.headers.get(WAITLIST_CLIENT_IP_HEADER) ?? undefined,
      });
      const verdict = await ctx.runAction(internal.oracle.consult, { input });
      return json(verdict, 200);
    } catch (error) {
      if (isRateLimitError(error)) {
        return json({ message: "Too many attempts." }, 429);
      }
      logEvent("error", "oracle_request_failed", {
        kind: input.kind,
        error_name: errorName(error),
      });
      return json({ message: "The oracle could not answer." }, 500);
    }
  }),
});

/**
 * Public preview for a branded share link (`shelvr-web.vercel.app/i/:token`).
 * The marketing site's `/i/[token]` route calls this to build the page's OG
 * tags. No secret: the random share token is the capability, and the
 * response is a narrow preview shape (see `getSharePreview`).
 */
http.route({
  pathPrefix: "/share/links/",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    const token = new URL(req.url).pathname.split("/").pop() ?? "";
    const preview = await ctx.runQuery(internal.items.getSharePreview, {
      token,
    });
    if (!preview) return json({ message: "Not found." }, 404);
    return json(preview, 200);
  }),
});

// ---------------------------------------------------------------------------
// iOS App Intents (Siri, Shortcuts)
// ---------------------------------------------------------------------------
//
// The Swift intents in `apps/native/app-intents/` save without launching the
// JavaScript app, authenticated by a per-device capture token rather than a
// Convex Auth JWT (see appIntents.ts). Every route answers JSON with an `error`
// code the Swift side maps to what Siri says: `unauthorized` (sign in again),
// `pro_required` (open Shelvr to subscribe), `rate_limited`, a save refusal
// code (`photo_limit`, `image_too_large`, `image_empty`), `bad_request`, or
// `failed`.

type CaptureRoute = "image_begin" | "image_finish" | "link" | "note";

function captureUnauthorized(): Response {
  return json({ error: "unauthorized" }, 401);
}

/** Maps a refused capture to its response. Never logs content or URLs. */
function isSavableUrl(url: string): boolean {
  try {
    normalizeExternalUrl(url);
    return true;
  } catch (error) {
    if (isUrlPolicyError(error)) return false;
    throw error;
  }
}

function captureFailure(route: CaptureRoute, error: unknown): Response {
  const code = saveErrorCode(error);
  if (code === "pro_required") return json({ error: code }, 402);
  if (code !== null) return json({ error: code }, 422);
  if (isRateLimitError(error)) return json({ error: "rate_limited" }, 429);
  logEvent("error", "app_intent_capture_failed", {
    route,
    error_name: errorName(error),
  });
  return json({ error: "failed" }, 500);
}

/** The caller's token hash and JSON body, or the response that ends it. */
async function readCapture(
  ctx: ActionCtx,
  req: Request,
): Promise<{ tokenHash: string; body: unknown } | Response> {
  const token = bearerToken(req.headers.get("authorization"));
  if (token === undefined) return captureUnauthorized();
  try {
    const tokenHash = await sha256Hex(token);
    if (
      !(await ctx.runMutation(internal.appIntents.authorizeCaptureBody, {
        tokenHash,
      }))
    ) {
      return captureUnauthorized();
    }
    return {
      tokenHash,
      body: JSON.parse(await readBoundedText(req, 128 * 1024)),
    };
  } catch (error) {
    if (error instanceof BodyTooLargeError)
      return json({ error: "bad_request" }, 413);
    if (isRateLimitError(error)) return json({ error: "rate_limited" }, 429);
    return json({ error: "bad_request" }, 400);
  }
}

http.route({
  path: "/app-intents/image/begin",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const read = await readCapture(ctx, req);
    if (read instanceof Response) return read;
    const request = parseImageBegin(read.body);
    if (!request) return json({ error: "bad_request" }, 400);
    try {
      const result = await ctx.runMutation(
        internal.appIntents.beginImageCapture,
        { tokenHash: read.tokenHash, operationId: request.operationId },
      );
      if (result.kind === "unauthorized") return captureUnauthorized();
      return json(
        result.kind === "upload"
          ? { uploadUrl: result.uploadUrl }
          : { itemId: result.itemId },
        200,
      );
    } catch (error) {
      return captureFailure("image_begin", error);
    }
  }),
});

http.route({
  path: "/app-intents/image/finish",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const read = await readCapture(ctx, req);
    if (read instanceof Response) return read;
    const request = parseImageFinish(read.body);
    if (!request) return json({ error: "bad_request" }, 400);
    try {
      const attached = await ctx.runMutation(
        internal.appIntents.attachImageCapture,
        {
          tokenHash: read.tokenHash,
          operationId: request.operationId,
          storageId: request.storageId,
        },
      );
      if (attached.kind === "unauthorized") return captureUnauthorized();
      if (attached.kind === "rejected") {
        return json(
          { error: attached.error },
          attached.error === "bad_request" ? 400 : 422,
        );
      }
      const saved = await ctx.runMutation(
        internal.appIntents.finalizeImageCapture,
        {
          tokenHash: read.tokenHash,
          operationId: request.operationId,
          aspectRatio: request.aspectRatio,
          isSticker: request.isSticker,
          spaceId: request.spaceId,
          captureContext: request.context,
        },
      );
      if (saved.kind === "unauthorized") return captureUnauthorized();
      return json({ itemId: saved.itemId }, 200);
    } catch (error) {
      return captureFailure("image_finish", error);
    }
  }),
});

http.route({
  path: "/app-intents/capture",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const read = await readCapture(ctx, req);
    if (read instanceof Response) return read;
    const request = parseLinkOrNote(read.body);
    if (!request) return json({ error: "bad_request" }, 400);
    // A link the URL policy refuses is the caller's to report, not a server
    // failure the app would queue and retry forever.
    if (request.kind === "link" && !isSavableUrl(request.url)) {
      return json({ error: "invalid_url" }, 422);
    }
    try {
      const saved = await ctx.runMutation(
        internal.appIntents.captureLinkOrNote,
        {
          tokenHash: read.tokenHash,
          operationId: request.operationId,
          kind: request.kind,
          url: request.kind === "link" ? request.url : undefined,
          text: request.kind === "note" ? request.text : undefined,
          spaceId: request.spaceId,
        },
      );
      if (saved.kind === "unauthorized") return captureUnauthorized();
      return json({ itemId: saved.itemId }, 200);
    } catch (error) {
      return captureFailure(request.kind, error);
    }
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
