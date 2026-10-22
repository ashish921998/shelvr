"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { env, internalAction } from "./_generated/server";
import { revokeRefreshToken } from "./model/appleClient";
import { errorName, logEvent } from "./model/log";

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 5 * 60_000;

type RevokeResult =
  | { kind: "unconfigured" }
  | { kind: "badKey"; error: unknown }
  | { kind: "status"; status: number }
  | { kind: "unreachable" };

async function revokeOnce(
  refreshToken: string,
  clientId: string | undefined,
): Promise<RevokeResult> {
  const resolvedClientId = clientId ?? process.env.AUTH_APPLE_ID;
  const privateKey = env.APPLE_REVOKE_PRIVATE_KEY;
  const keyId = env.APPLE_REVOKE_KEY_ID;
  const teamId = env.APPLE_REVOKE_TEAM_ID;
  if (!resolvedClientId || !privateKey || !keyId || !teamId) {
    return { kind: "unconfigured" };
  }
  try {
    const status = await revokeRefreshToken({
      refreshToken,
      clientId: resolvedClientId,
      privateKey,
      keyId,
      teamId,
    });
    return status === undefined
      ? { kind: "unreachable" }
      : { kind: "status", status };
  } catch (error) {
    return { kind: "badKey", error };
  }
}

function classify(result: RevokeResult, attempt: number): "settled" | "retry" {
  if (result.kind === "unconfigured") {
    logEvent("info", "apple_revoke_skipped", { code: "unconfigured" });
    return "settled";
  }
  if (result.kind === "badKey") {
    logEvent("error", "apple_revoke_failed", {
      code: "bad_signing_key",
      error: errorName(result.error),
    });
    return "settled";
  }
  if (
    result.kind === "status" &&
    result.status < 500 &&
    result.status !== 429
  ) {
    logEvent(
      result.status === 200 ? "info" : "error",
      "apple_revoke_finished",
      {
        status: result.status,
      },
    );
    return "settled";
  }
  const willRetry = attempt < MAX_ATTEMPTS;
  logEvent(willRetry ? "warn" : "error", "apple_revoke_failed", {
    code: "unreachable",
    attempt,
    ...(result.kind === "status" ? { status: result.status } : {}),
  });
  return willRetry ? "retry" : "settled";
}

export const revoke = internalAction({
  args: { tokenId: v.id("appleTokens"), attempt: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const stored = await ctx.runQuery(internal.users.appleTokenForRevoke, {
      tokenId: args.tokenId,
    });
    if (stored === null) return null;
    const attempt = args.attempt ?? 1;
    const result = await revokeOnce(stored.refreshToken, stored.clientId);
    if (classify(result, attempt) === "retry") {
      await ctx.scheduler.runAfter(
        RETRY_DELAY_MS * attempt,
        internal.appleRevoke.revoke,
        {
          tokenId: args.tokenId,
          attempt: attempt + 1,
        },
      );
    } else {
      await ctx.runMutation(internal.users.forgetAppleToken, {
        tokenId: args.tokenId,
      });
    }
    return null;
  },
});

export const revokeDetachedToken = internalAction({
  args: {
    tokenId: v.id("detachedAppleTokens"),
    attempt: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const refreshToken = await ctx.runQuery(
      internal.users.detachedAppleTokenForRevoke,
      { tokenId: args.tokenId },
    );
    if (refreshToken === null) return null;
    const attempt = args.attempt ?? 1;
    const result = await revokeOnce(refreshToken, undefined);
    if (classify(result, attempt) === "retry") {
      await ctx.scheduler.runAfter(
        RETRY_DELAY_MS * attempt,
        internal.appleRevoke.revokeDetachedToken,
        { tokenId: args.tokenId, attempt: attempt + 1 },
      );
    } else {
      await ctx.runMutation(internal.users.forgetDetachedAppleToken, {
        tokenId: args.tokenId,
      });
    }
    return null;
  },
});
