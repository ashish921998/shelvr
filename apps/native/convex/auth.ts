import Apple from "@auth/core/providers/apple";
import Google from "@auth/core/providers/google";
import { Anonymous } from "@convex-dev/auth/providers/Anonymous";
import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";
import {
  convexAuth,
  createAccount,
  type AuthProviderConfig,
} from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import type { DataModel, Id } from "./_generated/dataModel";
import { env, type ActionCtx } from "./_generated/server";
import { nativeAppleProfile, normalizeAppleProfile } from "./appleProfile";
import { recordAccountCreated } from "./model/accountCreated";
import {
  exchangeAuthorizationCode,
  revokeRefreshToken,
} from "./model/appleClient";
import {
  AppleIdTokenError,
  appleTokenSubject,
  verifyAppleIdToken,
} from "./model/appleIdToken";
import { keepAppleRefreshToken } from "./model/appleTokens";
import { isDevDeployment } from "./model/deployment";
import { errorName, logEvent } from "./model/log";

async function revokeUnstoredToken(
  signing: {
    clientId: string;
    privateKey: string;
    keyId: string;
    teamId: string;
  },
  refreshToken: string,
): Promise<void> {
  const status = await revokeRefreshToken({ ...signing, refreshToken });
  logEvent(
    status === 200 ? "info" : "error",
    "apple_native_late_token_revoke",
    status === undefined ? { code: "unreachable" } : { status },
  );
}

async function keepNativeAppleToken(
  ctx: ActionCtx,
  userId: Id<"users">,
  apple: { sub: string; audience: string },
  code: unknown,
) {
  const clientId = apple.audience;
  const privateKey = env.APPLE_REVOKE_PRIVATE_KEY;
  const keyId = env.APPLE_REVOKE_KEY_ID;
  const teamId = env.APPLE_REVOKE_TEAM_ID;
  if (typeof code !== "string" || !privateKey || !keyId || !teamId) {
    logEvent("info", "apple_native_token_skipped", {
      code: typeof code === "string" ? "unconfigured" : "no_code",
    });
    return;
  }
  try {
    const { refreshToken, identityToken, status } =
      await exchangeAuthorizationCode({
        code,
        clientId,
        privateKey,
        keyId,
        teamId,
      });
    if (refreshToken === null) {
      logEvent("error", "apple_native_token_failed", {
        code: "refused",
        ...(status !== undefined ? { status } : {}),
      });
      return;
    }
    const owner =
      identityToken === null
        ? null
        : await appleTokenSubject({ identityToken, audience: clientId }).catch(
            () => null,
          );
    if (owner !== apple.sub) {
      logEvent("error", "apple_native_token_failed", {
        code: owner === null ? "unverified_owner" : "wrong_owner",
      });
      return;
    }
    const stored = await ctx.runMutation(internal.users.keepNativeAppleToken, {
      userId,
      refreshToken,
      clientId,
    });
    if (!stored) {
      await revokeUnstoredToken(
        { clientId, privateKey, keyId, teamId },
        refreshToken,
      );
    }
  } catch (error) {
    logEvent("error", "apple_native_token_failed", {
      code: "unreachable",
      error: errorName(error),
    });
  }
}

const AppleNative = ConvexCredentials<DataModel>({
  id: "apple-native",
  authorize: async ({ identityToken, nonce, name, authorizationCode }, ctx) => {
    try {
      if (typeof identityToken !== "string" || typeof nonce !== "string")
        throw new AppleIdTokenError("invalid");
      const token = await verifyAppleIdToken({
        identityToken,
        nonce,
        audiences: isDevDeployment()
          ? ["app.shelvr.save.dev", "app.shelvr.save.preview"]
          : ["app.shelvr.save"],
      });
      const { user } = await createAccount(ctx, {
        provider: "apple",
        account: { id: token.sub },
        profile: nativeAppleProfile(token, name),
      });
      await keepNativeAppleToken(ctx, user._id, token, authorizationCode);
      return { userId: user._id };
    } catch (error) {
      if (!(error instanceof AppleIdTokenError)) throw error;
      logEvent("warn", "apple_native_sign_in_rejected", { code: error.code });
      return null;
    }
  },
});

const providers: AuthProviderConfig[] = [
  Google,
  Apple({ profile: normalizeAppleProfile }),
  AppleNative,
];
if (env.AUTH_ENABLE_ANONYMOUS === "true") {
  providers.push(Anonymous);
}

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers,
  callbacks: {
    afterUserCreatedOrUpdated: async (ctx, args) => {
      await keepAppleRefreshToken(ctx, args);
      await recordAccountCreated(ctx, args);
    },
    redirect: async ({ redirectTo }) => {
      const allowed = isDevDeployment()
        ? [
            "shelvr://auth/callback",
            "shelvr-dev://auth/callback",
            "shelvr-preview://auth/callback",
          ]
        : [
            "shelvr://auth/callback",
            "https://shelvr-web.vercel.app/auth/callback",
          ];
      if (!allowed.includes(redirectTo))
        throw new Error("Invalid OAuth callback");
      return redirectTo;
    },
  },
});
