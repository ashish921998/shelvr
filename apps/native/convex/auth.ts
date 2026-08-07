import Apple from "@auth/core/providers/apple";
import Google from "@auth/core/providers/google";
import { Anonymous } from "@convex-dev/auth/providers/Anonymous";
import { convexAuth, type AuthProviderConfig } from "@convex-dev/auth/server";

// Google and Apple are configured via @auth/core providers. Their client
// id/secret come from the AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET and
// AUTH_APPLE_ID / AUTH_APPLE_SECRET deployment env vars.
//
// Anonymous is an instant sign-in (no credentials) used only for local
// development. It is gated behind AUTH_ENABLE_ANONYMOUS so a production
// deployment never exposes a passwordless back door — set it to "true" on
// the dev deployment only.
const providers: AuthProviderConfig[] = [Google, Apple];
if (process.env.AUTH_ENABLE_ANONYMOUS === "true") {
  providers.push(Anonymous);
}

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers,
});
