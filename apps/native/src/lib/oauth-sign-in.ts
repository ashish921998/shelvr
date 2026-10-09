import { markAiDisclosedAtSignIn } from "@/lib/ai-consent";
import { analytics, type AuthMethod, type OAuthSurface } from "@/lib/analytics";
import { useAuthActions } from "@convex-dev/auth/react";
import * as AppleAuthentication from "expo-apple-authentication";
import { makeRedirectUri } from "expo-auth-session";
import Constants from "expo-constants";
import {
  CryptoDigestAlgorithm,
  digestStringAsync,
  randomUUID,
} from "expo-crypto";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useState } from "react";
import { Platform } from "react-native";

// Convex Auth OAuth sign-in (React Native), extracted from the sign-in screen
// so the onboarding demo step can authenticate inline — without navigating
// away and losing the user's in-progress onboarding state.
//
// The flow is provider-agnostic: `signIn(provider)` returns a `redirect` URL
// hosted on the Convex backend. We open it in a system browser session
// (expo-web-browser `openAuthSessionAsync`); after the user authenticates the
// browser redirects back to the app with a `?code=` param. We extract that
// code and call `signIn(provider, { code })` to complete the handshake.
//
// Apple on iOS takes the system's own Sign in with Apple sheet instead
// (`AuthMethod` "native"): the browser session often failed to present there,
// and the sheet hands back an identity token the backend verifies directly.
const oauthScheme =
  Constants.expoConfig?.extra?.variant === "production"
    ? "shelvr"
    : Constants.expoConfig?.extra?.variant === "preview"
      ? "shelvr-preview"
      : "shelvr-dev";
const iosVersion = String(Platform.Version).split(".").map(Number);
const preferUniversalLinks =
  Platform.OS === "ios" &&
  Constants.expoConfig?.extra?.variant === "production" &&
  (iosVersion[0] > 17 || (iosVersion[0] === 17 && (iosVersion[1] ?? 0) >= 4));
const oauthRedirectTo = preferUniversalLinks
  ? "https://shelvr-web.vercel.app/auth/callback"
  : makeRedirectUri({
      native: `${oauthScheme}://auth/callback`,
      scheme: oauthScheme,
      path: "auth/callback",
    });

export type OAuthProvider = "apple" | "google" | "anonymous";

type OAuthSignInOutcome = "completed" | "cancelled" | "failed";

type SignInStage = "request" | "browser" | "exchange";

/**
 * The native module resolves every failed auth session with the OS error in
 * the result dictionary, but `WebBrowserAuthSessionResult` does not declare
 * the field, so it is read through a widened type rather than a cast to `any`.
 *
 * Only the NSError domain and code are kept. They are what separate a person
 * backing out (`canceledLogin`, 1) from a session that could not present
 * (`presentationContextNotProvided`, 2 / `presentationContextInvalid`, 3), and
 * unlike the description they carry no free-form text.
 *
 * What arrives is `localizedDescription`, which renders as
 * "… (<domain> <label> <code>.)". The domain and the code are stable, but the
 * label between them is Foundation's own and follows the device language, so
 * matching the English word "error" would drop the diagnostic on exactly the
 * devices hardest to get a second look at. Step over the label instead, and
 * allow the full-width parentheses a CJK locale can render.
 */
const NATIVE_ERROR =
  /[(（]([A-Za-z][A-Za-z0-9.]*[A-Za-z0-9])[^()（）]*?(-?\d+)[^()（）]*[)）]/;

function nativeError(result: WebBrowser.WebBrowserAuthSessionResult) {
  const description = (result as { error?: unknown }).error;
  if (typeof description !== "string") return {};
  const match = NATIVE_ERROR.exec(description);
  // Anything that does not render as an NSError is dropped rather than
  // guessed at. A missing field says "unparsed", which is honest; a wrong
  // domain or code would send the next person chasing the wrong failure.
  if (match === null) return {};
  return {
    native_error_domain: match[1],
    native_error_code: Number(match[2]),
  };
}

type SignIn = ReturnType<typeof useAuthActions>["signIn"];

/** Where an attempt stands, kept outside the flow so a throw still reports
 * the stage it reached and whether it had already retried. */
type Progress = { stage: SignInStage; autoRetry: boolean };

type FlowOutcome =
  | { type: "completed" }
  | {
      type: "cancelled";
      result: "cancel" | "dismiss";
      browserMs: number;
      nativeError: ReturnType<typeof nativeError>;
    };

/** Apple on iOS uses the system sheet when the device offers it. Everything
 * else, Apple included where the sheet is missing, is a web session. */
async function authMethod(provider: OAuthProvider): Promise<AuthMethod> {
  if (provider !== "apple" || Platform.OS !== "ios") return "web";
  const available = await AppleAuthentication.isAvailableAsync().catch(
    () => false,
  );
  return available ? "native" : "web";
}

/** A person needs seconds to back out. A session that ends faster than this
 * never presented its sheet. */
const INSTANT_DEATH_MS = 800;

/** One automatic reopen, for a web session that died before anyone could have
 * seen it. A slow cancel is a person's choice and is never retried. */
export function shouldAutoRetry(
  result: string,
  browserMs: number,
  alreadyRetried: boolean,
): boolean {
  return (
    !alreadyRetried &&
    (result === "cancel" || result === "dismiss") &&
    browserMs < INSTANT_DEATH_MS
  );
}

async function openSession(redirect: URL, progress: Progress) {
  for (;;) {
    const openedAt = Date.now();
    const result = preferUniversalLinks
      ? await WebBrowser.openAuthSessionAsync(
          redirect.toString(),
          oauthRedirectTo,
          { preferUniversalLinks: true },
        )
      : await WebBrowser.openAuthSessionAsync(
          redirect.toString(),
          oauthRedirectTo,
        );
    const browserMs = Date.now() - openedAt;
    if (!shouldAutoRetry(result.type, browserMs, progress.autoRetry))
      return { result, browserMs };
    progress.autoRetry = true;
  }
}

async function webSignIn(
  provider: OAuthProvider,
  signIn: SignIn,
  progress: Progress,
): Promise<FlowOutcome> {
  // Convex Auth must persist the same return URI that the browser
  // session watches for; otherwise the provider callback can open
  // Shelvr without resolving this promise and the one-time code is
  // never exchanged.
  const { redirect } = await signIn(provider, { redirectTo: oauthRedirectTo });
  // `redirect` is undefined for providers that sign in immediately
  // (Anonymous) — nothing more to do, the session is established.
  if (!redirect) return { type: "completed" };
  progress.stage = "browser";
  const { result, browserMs } = await openSession(redirect, progress);
  if (result.type === "cancel" || result.type === "dismiss") {
    return {
      type: "cancelled",
      result: result.type,
      browserMs,
      nativeError: nativeError(result),
    };
  }
  if (result.type !== "success") {
    throw new Error(`OAuth browser session ended with ${result.type}`);
  }
  // Hand the callback URL's code back to the provider to finish the
  // sign-in.
  const callback = new URL(result.url);
  const expected = new URL(oauthRedirectTo);
  if (
    callback.protocol !== expected.protocol ||
    callback.host !== expected.host ||
    callback.pathname !== expected.pathname
  )
    throw new Error("Unexpected OAuth callback");
  const code = callback.searchParams.get("code");
  if (!code) {
    throw new Error("OAuth callback did not include a verification code");
  }
  progress.stage = "exchange";
  const { signingIn } = await signIn(provider, { code });
  if (!signingIn) throw new Error("OAuth code exchange did not sign in");
  return { type: "completed" };
}

async function nativeAppleSignIn(
  signIn: SignIn,
  progress: Progress,
): Promise<FlowOutcome> {
  progress.stage = "browser";
  const openedAt = Date.now();
  // Apple gets the hash and the backend gets the value, so the identity token
  // alone cannot be replayed. Apple copies what it is given into the token's
  // `nonce` claim unchanged.
  const nonce = randomUUID();
  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: await digestStringAsync(CryptoDigestAlgorithm.SHA256, nonce),
    });
  } catch (err) {
    if ((err as { code?: unknown }).code !== "ERR_REQUEST_CANCELED") throw err;
    return {
      type: "cancelled",
      result: "cancel",
      browserMs: Date.now() - openedAt,
      nativeError: {},
    };
  }
  if (!credential.identityToken) {
    throw new Error("Apple sign-in returned no identity token");
  }
  // Apple shares the name on a person's first authorization only.
  const name = [credential.fullName?.givenName, credential.fullName?.familyName]
    .filter(Boolean)
    .join(" ");
  progress.stage = "exchange";
  const { signingIn } = await signIn("apple-native", {
    identityToken: credential.identityToken,
    nonce,
    ...(name ? { name } : {}),
  });
  if (!signingIn) throw new Error("Apple identity token did not sign in");
  return { type: "completed" };
}

export function useOAuthSignIn(surface: OAuthSurface) {
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
      // Every screen that offers sign-in shows the AI disclosure beside it.
      markAiDisclosedAtSignIn();
      setPendingProvider(provider);
      setLastError(null);
      setInterrupted(false);
      const method = await authMethod(provider);
      // One id per attempt, shared by the start, cancel, failure, and success
      // events, so a funnel can pair each start with the outcome that ended it.
      const attempt = {
        provider,
        surface,
        method,
        auth_attempt_id: randomUUID(),
      };
      analytics.capture("auth_started", attempt);
      const startedAt = Date.now();
      const progress: Progress = { stage: "request", autoRetry: false };
      // Present only on an attempt whose web session was reopened.
      const ended = () => ({
        ...attempt,
        elapsed_ms: Date.now() - startedAt,
        ...(progress.autoRetry ? { auto_retry: true as const } : {}),
      });
      try {
        const outcome =
          method === "native"
            ? await nativeAppleSignIn(signIn, progress)
            : await webSignIn(provider, signIn, progress);
        if (outcome.type === "cancelled") {
          // A person needs seconds to back out; a sheet that ends in well under
          // one is the system failing to present it. Until the OS error below
          // reaches enough sessions, the timings are the only thing telling
          // those apart.
          analytics.capture("auth_cancelled", {
            ...ended(),
            result: outcome.result,
            browser_ms: outcome.browserMs,
            ...outcome.nativeError,
          });
          // The Apple sheet reports a real cancel, so only a web session's
          // ambiguous one asks for the retry hint.
          setInterrupted(method === "web");
          return "cancelled";
        }
        analytics.capture("auth_succeeded", ended());
        return "completed";
      } catch (err) {
        analytics.capture("auth_failed", {
          ...ended(),
          stage: progress.stage,
        });
        const detail =
          err instanceof Error ? `${err.name}: ${err.message}` : String(err);
        analytics.captureError("auth_failed", err, {
          provider,
          stage: progress.stage,
          surface,
        });
        setLastError(detail);
        return "failed";
      } finally {
        setPendingProvider(null);
      }
    },
    [signIn, surface],
  );

  return { signInWith, pendingProvider, lastError, interrupted };
}
