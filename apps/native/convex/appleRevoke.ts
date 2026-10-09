"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { env, internalAction, type ActionCtx } from "./_generated/server";
import { errorName, logEvent } from "./model/log";

const REVOKE_URL = "https://appleid.apple.com/auth/revoke";
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 5 * 60_000;

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function encodeJson(value: unknown): string {
  return base64Url(new TextEncoder().encode(JSON.stringify(value)));
}

/** Apple's client secret: a short-lived ES256 JWT signed with the team's .p8
 * key. WebCrypto's ECDSA signature is already the raw r||s form a JWT wants. */
async function clientSecret(config: {
  clientId: string;
  privateKey: string;
  keyId: string;
  teamId: string;
}): Promise<string> {
  const der = Uint8Array.from(
    atob(
      config.privateKey
        // An env var pasted on one line carries its newlines as "\n".
        .replace(/\\n/g, "")
        .replace(/-----[A-Z ]+-----/g, "")
        .replace(/\s+/g, ""),
    ),
    (c) => c.charCodeAt(0),
  );
  const key = await crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const issuedAt = Math.floor(Date.now() / 1000);
  const signed = `${encodeJson({ alg: "ES256", kid: config.keyId })}.${encodeJson(
    {
      iss: config.teamId,
      iat: issuedAt,
      exp: issuedAt + 300,
      aud: "https://appleid.apple.com",
      sub: config.clientId,
    },
  )}`;
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(signed),
  );
  return `${signed}.${base64Url(new Uint8Array(signature))}`;
}

async function forget(ctx: ActionCtx, tokenId: Id<"appleTokens">) {
  await ctx.runMutation(internal.users.forgetAppleToken, { tokenId });
}

/**
 * Revokes a Sign in with Apple refresh token after its account was deleted.
 * Best effort by design: nothing about the deletion
 * depends on Apple answering. Only "Apple could not be reached" is retried;
 * a refusal (an already revoked token, a bad key) would be refused again.
 */
export const revoke = internalAction({
  args: { tokenId: v.id("appleTokens"), attempt: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const refreshToken = await ctx.runQuery(
      internal.users.appleTokenForRevoke,
      { tokenId: args.tokenId },
    );
    if (refreshToken === null) return null;
    // Convex Auth's own variable, so it is not declared in convex.config.ts.
    const clientId = process.env.AUTH_APPLE_ID;
    const privateKey = env.APPLE_REVOKE_PRIVATE_KEY;
    const keyId = env.APPLE_REVOKE_KEY_ID;
    const teamId = env.APPLE_REVOKE_TEAM_ID;
    if (!clientId || !privateKey || !keyId || !teamId) {
      logEvent("info", "apple_revoke_skipped", { code: "unconfigured" });
      await forget(ctx, args.tokenId);
      return null;
    }
    let secret: string;
    try {
      secret = await clientSecret({ clientId, privateKey, keyId, teamId });
    } catch (error) {
      logEvent("error", "apple_revoke_failed", {
        code: "bad_signing_key",
        error: errorName(error),
      });
      await forget(ctx, args.tokenId);
      return null;
    }
    const attempt = args.attempt ?? 1;
    let status: number | undefined;
    try {
      const response = await fetch(REVOKE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: secret,
          token: refreshToken,
          token_type_hint: "refresh_token",
        }).toString(),
        signal: AbortSignal.timeout(15_000),
      });
      status = response.status;
    } catch {
      status = undefined;
    }
    // 429 is Apple asking us to slow down, not a refusal: keep the token and
    // take the bounded retry path.
    if (status !== undefined && status < 500 && status !== 429) {
      logEvent(status === 200 ? "info" : "error", "apple_revoke_finished", {
        status,
      });
      await forget(ctx, args.tokenId);
      return null;
    }
    const willRetry = attempt < MAX_ATTEMPTS;
    logEvent(willRetry ? "warn" : "error", "apple_revoke_failed", {
      code: "unreachable",
      attempt,
      ...(status !== undefined ? { status } : {}),
    });
    if (willRetry) {
      await ctx.scheduler.runAfter(
        RETRY_DELAY_MS * attempt,
        internal.appleRevoke.revoke,
        { tokenId: args.tokenId, attempt: attempt + 1 },
      );
    } else {
      await forget(ctx, args.tokenId);
    }
    return null;
  },
});
