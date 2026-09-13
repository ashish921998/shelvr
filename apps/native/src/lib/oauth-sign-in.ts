import { analytics } from "@/lib/analytics";
import { useAuthActions } from "@convex-dev/auth/react";
import { makeRedirectUri } from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useState } from "react";

// Convex Auth OAuth sign-in (React Native), extracted from the sign-in screen
// so the onboarding demo step can authenticate inline — without navigating
// away and losing the user's in-progress onboarding state.
//
// The flow is provider-agnostic: `signIn(provider)` returns a `redirect` URL
// hosted on the Convex backend. We open it in a system browser session
// (expo-web-browser `openAuthSessionAsync`); after the user authenticates the
// browser redirects back to the app with a `?code=` param. We extract that
// code and call `signIn(provider, { code })` to complete the handshake.
const oauthRedirectTo = makeRedirectUri({
  native: "shelvr://auth/callback",
  scheme: "shelvr",
  path: "auth/callback",
});

export type OAuthProvider = "apple" | "google" | "anonymous";

type OAuthSignInOutcome = "completed" | "cancelled" | "failed";

export function useOAuthSignIn() {
  const { signIn } = useAuthActions();
  const [pendingProvider, setPendingProvider] = useState<OAuthProvider | null>(
    null,
  );
  const [lastError, setLastError] = useState<string | null>(null);

  const signInWith = useCallback(
    async (provider: OAuthProvider): Promise<OAuthSignInOutcome> => {
      analytics.capture("auth_started", { provider });
      setPendingProvider(provider);
      setLastError(null);
      try {
        // Convex Auth must persist the same return URI that the browser
        // session watches for; otherwise the provider callback can open
        // Shelvr without resolving this promise and the one-time code is
        // never exchanged.
        const { redirect } = await signIn(provider, {
          redirectTo: oauthRedirectTo,
        });
        // `redirect` is undefined for providers that sign in immediately
        // (Anonymous) — nothing more to do, the session is established.
        if (!redirect) {
          return "completed";
        }
        const result = await WebBrowser.openAuthSessionAsync(
          redirect.toString(),
          oauthRedirectTo,
        );
        if (result.type === "cancel" || result.type === "dismiss") {
          analytics.capture("auth_cancelled", { provider });
          return "cancelled";
        }
        if (result.type !== "success") {
          throw new Error(`OAuth browser session ended with ${result.type}`);
        }
        // Hand the callback URL's code back to the provider to finish the
        // sign-in.
        const code = new URL(result.url).searchParams.get("code");
        if (!code) {
          throw new Error("OAuth callback did not include a verification code");
        }
        await signIn(provider, { code });
        return "completed";
      } catch (err) {
        analytics.capture("auth_failed", { provider });
        const detail =
          err instanceof Error ? `${err.name}: ${err.message}` : String(err);
        analytics.captureError("auth_failed", err, { provider });
        setLastError(detail);
        return "failed";
      } finally {
        setPendingProvider(null);
      }
    },
    [signIn],
  );

  return { signInWith, pendingProvider, lastError };
}
