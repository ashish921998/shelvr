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

type SignInStage = "request" | "browser" | "exchange";

export function useOAuthSignIn() {
  const { signIn } = useAuthActions();
  const [pendingProvider, setPendingProvider] = useState<OAuthProvider | null>(
    null,
  );
  const [lastError, setLastError] = useState<string | null>(null);
  // expo-web-browser reports every auth-session error as a "cancel", so a
  // cancel is not proof the person backed out. Callers keep the sheet open and
  // offer a retry instead of silently closing it.
  const [interrupted, setInterrupted] = useState(false);

  const signInWith = useCallback(
    async (provider: OAuthProvider): Promise<OAuthSignInOutcome> => {
      analytics.capture("auth_started", { provider });
      setPendingProvider(provider);
      setLastError(null);
      setInterrupted(false);
      const startedAt = Date.now();
      const elapsedMs = () => Date.now() - startedAt;
      let stage: SignInStage = "request";
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
          analytics.capture("auth_succeeded", {
            provider,
            elapsed_ms: elapsedMs(),
          });
          return "completed";
        }
        stage = "browser";
        const browserStartedAt = Date.now();
        const result = await WebBrowser.openAuthSessionAsync(
          redirect.toString(),
          oauthRedirectTo,
        );
        if (result.type === "cancel" || result.type === "dismiss") {
          // A person needs seconds to back out; a sheet that ends in well under
          // one is the system failing to present it. The timings tell them apart.
          analytics.capture("auth_cancelled", {
            provider,
            elapsed_ms: elapsedMs(),
            browser_ms: Date.now() - browserStartedAt,
          });
          setInterrupted(true);
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
        stage = "exchange";
        const { signingIn } = await signIn(provider, { code });
        if (!signingIn) {
          throw new Error("OAuth code exchange did not sign in");
        }
        analytics.capture("auth_succeeded", {
          provider,
          elapsed_ms: elapsedMs(),
        });
        return "completed";
      } catch (err) {
        analytics.capture("auth_failed", {
          provider,
          stage,
          elapsed_ms: elapsedMs(),
        });
        const detail =
          err instanceof Error ? `${err.name}: ${err.message}` : String(err);
        analytics.captureError("auth_failed", err, { provider, stage });
        setLastError(detail);
        return "failed";
      } finally {
        setPendingProvider(null);
      }
    },
    [signIn],
  );

  return { signInWith, pendingProvider, lastError, interrupted };
}
