import { httpRouter } from "convex/server";
import { isRateLimitError } from "@convex-dev/rate-limiter";
import { env, httpAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { auth } from "./auth";
import { isDevDeployment } from "./model/deployment";
import {
  isTestStore,
  mapRevenueCatStatus,
  parseRevenueCatEvent,
  requiresAuthoritativeReconciliation,
} from "./model/revenuecat";
import { reconcileRevenueCatCustomers } from "./model/revenuecatReconcile";
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
import { parsePlanVote, type PlanVoteBody } from "./model/planVote";
import { parseOracleInput } from "./model/oracle";
import { parsePaymentTelemetry } from "./model/paymentTelemetry";
import { APPLE_ROOT_CA_G3 } from "./model/appleJws";
import {
  RETENTION_MAX_BODY_BYTES,
  answerRetentionRequest,
  parseRetentionOffers,
} from "./model/retentionMessaging";
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
  confirmWaitlist,
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
      // Do not cancel the retry body: cancellation resets HTTP/2.
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

auth.addHttpRoutes(http);

http.route({
  path: "/webhooks/revenuecat",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const secret = env.REVENUECAT_WEBHOOK_SECRET;
    if (!secret) {
      return new Response("Webhook secret not configured", { status: 500 });
    }
    const authHeader = req.headers.get("authorization") ?? "";
    if (!(await secureCompare(`Bearer ${secret}`, authHeader))) {
      return new Response("Unauthorized", { status: 401 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return new Response("Bad payload", { status: 400 });
    }
    const event = parseRevenueCatEvent(body);
    if (event === undefined) {
      return new Response("Bad payload", { status: 400 });
    }
    // Test Store purchases cost nothing, so only the dev deployment may grant Pro for one.
    if (isTestStore(event.store) && !isDevDeployment()) {
      logEvent("warn", "revenuecat_test_store_ignored", {
        event_type: event.type ?? "unknown",
      });
      return new Response(null, { status: 200 });
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
        await reconcileRevenueCatCustomers(
          ctx,
          [...event.transferredFrom, ...event.transferredTo],
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

    if (
      event.type === undefined ||
      event.userId === undefined ||
      event.eventTimestampMs === undefined
    ) {
      return new Response(null, { status: 200 });
    }

    const { type, userId, productId, periodType, eventTimestampMs } = event;

    if (requiresAuthoritativeReconciliation(event)) {
      try {
        await reconcileRevenueCatCustomers(ctx, [userId], eventTimestampMs);
      } catch (error) {
        logEvent("error", "revenuecat_reconciliation_failed", {
          event_type: type,
          error_name: errorName(error),
        });
        return new Response("Subscription reconciliation unavailable", {
          status: 503,
        });
      }
    } else {
      const status = mapRevenueCatStatus(type, periodType);
      await ctx.runMutation(internal.subscriptions.upsertSubscription, {
        userId,
        status,
        expiresAt: event.expiresAt ?? 0,
        productId,
        eventTimestampMs,
      });
    }
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

/** Apple's Get Retention Message endpoint: authenticated by Apple's request signature alone, and Apple allows 700 ms, so it reads no database. */
http.route({
  path: "/retention-messaging",
  method: "POST",
  handler: httpAction(async (_ctx, req) => {
    let body: string;
    try {
      body = await readBoundedText(req, RETENTION_MAX_BODY_BYTES);
    } catch (error) {
      logEvent("warn", "retention_request_rejected", {
        reason:
          error instanceof BodyTooLargeError
            ? "body_too_large"
            : "body_unreadable",
      });
      return json({ error: "bad_request" }, 400);
    }
    const keyId = env.APPLE_IAP_KEY_ID;
    const issuerId = env.APPLE_IAP_ISSUER_ID;
    const privateKey = env.APPLE_IAP_PRIVATE_KEY;
    const reply = await answerRetentionRequest(body, {
      root: APPLE_ROOT_CA_G3,
      now: Date.now(),
      messageId: env.APPLE_RETENTION_MESSAGE_ID,
      offers: parseRetentionOffers(env.APPLE_RETENTION_OFFERS),
      signingKey:
        keyId && issuerId && privateKey
          ? { keyId, issuerId, privateKey }
          : undefined,
    });
    if (reply.reason)
      logEvent(
        "warn",
        reply.status === 200
          ? "retention_offer_skipped"
          : "retention_request_rejected",
        { reason: reply.reason },
      );
    return json(reply.body, reply.status);
  }),
});

http.route({
  path: "/request-body",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const secret = env.WAITLIST_SHARED_SECRET;
    if (
      !secret ||
      !(await secureCompare(
        secret,
        req.headers.get(WAITLIST_SECRET_HEADER) ?? "",
      ))
    )
      return json({ error: "unauthorized" }, 401);
    const route = req.headers.get("x-shelvr-body-route");
    if (route !== "oracle" && route !== "waitlist" && route !== "oracle-image")
      return json({ error: "bad_request" }, 400);
    try {
      await ctx.runMutation(internal.oracleLimits.claimRequestBody, {
        route,
        ip: req.headers.get(WAITLIST_CLIENT_IP_HEADER) ?? undefined,
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

export const WAITLIST_CLIENT_IP_HEADER = "x-shelvr-client-ip";
export const WAITLIST_SECRET_HEADER = "x-waitlist-secret";

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
      // Convex argument errors print the failing args, which include the address.
      logEvent("error", "waitlist_join_failed", {
        error_name: errorName(error),
      });
      return json({ message: "Could not join right now." }, 500);
    }
  }),
});

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

http.route({
  pathPrefix: "/plan/shares/",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    const token = new URL(req.url).pathname.split("/").pop() ?? "";
    const share = await ctx.runQuery(internal.planShares.getPublicPlanShare, {
      token,
    });
    if (!share) return json({ message: "Not found." }, 404);
    return json(share, 200);
  }),
});

http.route({
  path: "/plan/votes",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const secret = env.WAITLIST_SHARED_SECRET;
    if (!secret) {
      return json({ message: "Vote secret not configured." }, 500);
    }
    const provided = req.headers.get(WAITLIST_SECRET_HEADER) ?? "";
    if (!(await secureCompare(secret, provided))) {
      return json({ message: "Unauthorized." }, 401);
    }

    let vote: PlanVoteBody | null;
    try {
      vote = parsePlanVote(JSON.parse(await readBoundedText(req, 2048)));
    } catch {
      return json({ message: "Invalid request." }, 400);
    }
    if (!vote) return json({ message: "Invalid request." }, 400);

    try {
      const outcome = await ctx.runMutation(
        internal.planShares.recordPlanVote,
        {
          ...vote,
          ip: req.headers.get(WAITLIST_CLIENT_IP_HEADER) ?? undefined,
        },
      );
      if (outcome === "missing") return json({ outcome }, 404);
      if (outcome === "full") return json({ outcome }, 409);
      return json({ outcome }, 200);
    } catch (error) {
      if (isRateLimitError(error)) {
        return json({ message: "Too many attempts." }, 429);
      }
      logEvent("error", "plan_vote_failed", { error_name: errorName(error) });
      return json({ message: "Could not save your vote." }, 500);
    }
  }),
});

type CaptureRoute = "image_begin" | "image_finish" | "link" | "note";

function captureUnauthorized(): Response {
  return json({ error: "unauthorized" }, 401);
}

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

export default http;

http.route({
  path: "/waitlist/confirm",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const secret = env.WAITLIST_SHARED_SECRET;
    if (
      !secret ||
      !(await secureCompare(
        secret,
        req.headers.get(WAITLIST_SECRET_HEADER) ?? "",
      ))
    )
      return json({ error: "unauthorized" }, 401);
    try {
      await ctx.runMutation(internal.oracleLimits.claimRequestBody, {
        route: "waitlist",
        ip: req.headers.get(WAITLIST_CLIENT_IP_HEADER) ?? undefined,
      });
      const { token } = JSON.parse(await readBoundedText(req, 1024)) as {
        token?: unknown;
      };
      if (typeof token !== "string" || !(await confirmWaitlist(ctx, token)))
        return json({ error: "invalid_token" }, 400);
      return json({ ok: true }, 200);
    } catch (error) {
      if (isRateLimitError(error)) return json({ error: "rate_limited" }, 429);
      return json({ error: "invalid_request" }, 400);
    }
  }),
});
