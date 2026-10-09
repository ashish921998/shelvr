import Apple from "@auth/core/providers/apple";
import Google from "@auth/core/providers/google";
import { Anonymous } from "@convex-dev/auth/providers/Anonymous";
import { convexAuth, type AuthProviderConfig } from "@convex-dev/auth/server";
import { env } from "./_generated/server";
import { normalizeAppleProfile } from "./appleProfile";
import { GoogleIdToken } from "./model/googleIdToken";
import { recordAccountCreated } from "./model/accountCreated";
import { keepAppleRefreshToken } from "./model/appleTokens";

// Google and Apple are configured via @auth/core providers. Their client
// id/secret come from the AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET and
// AUTH_APPLE_ID / AUTH_APPLE_SECRET deployment env vars.
//
// GoogleIdToken is the Android account sheet: it signs in with a Google ID
// token the app gets from Credential Manager, onto the same "google" account.
//
// Anonymous is an instant sign-in (no credentials) used only for local
// development. It is gated behind AUTH_ENABLE_ANONYMOUS so a production
// deployment never exposes a passwordless back door — set it to "true" on
// the dev deployment only.
const providers: AuthProviderConfig[] = [
  Google,
  Apple({ profile: normalizeAppleProfile }),
  GoogleIdToken,
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
      const allowed =
        process.env.CONVEX_SITE_URL?.replace(/\/+$/, "") ===
        "https://amicable-antelope-639.convex.site"
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
