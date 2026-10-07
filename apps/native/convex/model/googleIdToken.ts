import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";
import { createAccount } from "@convex-dev/auth/server";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { DataModel } from "../_generated/dataModel";
import { env } from "../_generated/server";

// Native Google sign-in. The Android app asks Credential Manager for a Google
// ID token (the account bottom sheet, no browser) and hands it here as
// `signIn("google-id-token", { idToken })`.
//
// The account is stored under provider "google" with the token's `sub`, which
// is exactly the row the browser OAuth flow writes. Either path finds the
// same person, so nobody who signed in before gets a second account.

const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

let googleKeys: ReturnType<typeof createRemoteJWKSet> | undefined;

/** The verified claims of a Google ID token, or null if it is not one. */
export async function verifyGoogleIdToken(idToken: string, audience: string) {
  googleKeys ??= createRemoteJWKSet(
    new URL("https://www.googleapis.com/oauth2/v3/certs"),
  );
  try {
    const { payload } = await jwtVerify(idToken, googleKeys, {
      issuer: GOOGLE_ISSUERS,
      audience,
    });
    if (typeof payload.sub !== "string") return null;
    // Linking by email is only safe when Google vouches for the address.
    if (typeof payload.email !== "string" || payload.email_verified !== true)
      return null;
    return {
      sub: payload.sub,
      profile: {
        email: payload.email,
        ...(typeof payload.name === "string" ? { name: payload.name } : {}),
        ...(typeof payload.picture === "string"
          ? { image: payload.picture }
          : {}),
      },
    };
  } catch {
    return null;
  }
}

export const GoogleIdToken = ConvexCredentials<DataModel>({
  id: "google-id-token",
  authorize: async (credentials, ctx) => {
    // The token's audience is the web client the browser flow already uses;
    // the app passes the same id to Credential Manager as serverClientId.
    const audience = env.AUTH_GOOGLE_ID;
    if (!audience || typeof credentials.idToken !== "string") return null;
    const claims = await verifyGoogleIdToken(credentials.idToken, audience);
    if (claims === null) return null;
    const { user } = await createAccount(ctx, {
      provider: "google",
      account: { id: claims.sub },
      // Like the browser flow, a verified email already on a user (an Apple
      // sign-in with the same address) links to that user.
      profile: claims.profile,
    });
    return { userId: user._id };
  },
});
