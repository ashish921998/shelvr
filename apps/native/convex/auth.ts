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
import { exchangeAuthorizationCode } from "./model/appleClient";
import { AppleIdTokenError, verifyAppleIdToken } from "./model/appleIdToken";
import { keepAppleRefreshToken } from "./model/appleTokens";
import { errorName, logEvent } from "./model/log";

// The dev deployment serves the development and preview builds; every other
// deployment serves the store build only.
const isDevDeployment = () =>
  process.env.CONVEX_SITE_URL?.replace(/\/+$/, "") ===
  "https://amicable-antelope-639.convex.site";

// The native sheet hands the app a one-time code where the web flow hands the
// backend a refresh token. Trading the code here is what lets account deletion
// revoke the sign-in with Apple later. Best effort: a person is signed in
// whether or not Apple answers, and without the signing key nothing is asked.
async function keepNativeAppleToken(
  ctx: ActionCtx,
  userId: Id<"users">,
  clientId: string,
  code: unknown,
) {
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
    const { refreshToken, status } = await exchangeAuthorizationCode({
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
    await ctx.runMutation(internal.users.keepNativeAppleToken, {
      userId,
      refreshToken,
      clientId,
    });
  } catch (error) {
    logEvent("error", "apple_native_token_failed", {
      code: "unreachable",
      error: errorName(error),
    });
  }
}

// The native Sign in with Apple sheet on iOS. Its identity token names the
// app's bundle id as audience, where the web flow's names the Service ID. The
// account is stored under the web flow's provider id, "apple", keyed by the
// token `sub`, which is the same for both flows within one Apple team. A
// person who signed in through the web flow therefore lands on the same user.
// An existing account is returned as it is, so its name and email are never
// overwritten by a later sign-in that carries neither.
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
      await keepNativeAppleToken(
        ctx,
        user._id,
        token.audience,
        authorizationCode,
      );
      return { userId: user._id };
    } catch (error) {
      if (!(error instanceof AppleIdTokenError)) throw error;
      logEvent("warn", "apple_native_sign_in_rejected", { code: error.code });
      return null;
    }
  },
});

// Google and Apple are configured via @auth/core providers. Their client
// id/secret come from the AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET and
// AUTH_APPLE_ID / AUTH_APPLE_SECRET deployment env vars.
//
// Anonymous is an instant sign-in (no credentials) used only for local
// development. It is gated behind AUTH_ENABLE_ANONYMOUS so a production
// deployment never exposes a passwordless back door — set it to "true" on
// the dev deployment only.
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
