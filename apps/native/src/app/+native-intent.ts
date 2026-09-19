import { readOnboardedFlag } from "@/lib/onboarding";
import { markPendingShareOnDevice } from "@/lib/share/pending-share-store";
import { isDeepLink, markDirectLaunch } from "@/lib/splash/launch-intent";
import * as Linking from "expo-linking";

// expo-sharing launches the app with a `<scheme>://expo-sharing` deep link when
// something is shared into Shelvr from another app. Route those to the receiver
// screen; leave every other deep link untouched.
//
// Before onboarding, the demo step reads the share: it saves a single link
// while it still wants one and flags anything else itself. Otherwise mark it:
// a signed-out user is redirected away from `/share`, and the flag resumes the
// share after sign-in.
export function redirectSystemPath({
  path,
}: {
  path: string;
  initial: boolean;
}) {
  // Every link into the app arrives here, so it is also where the launch
  // animation learns to stand down: a user opening a share or a deep link is
  // on their way somewhere and should not wait out a splash first.
  //
  // A plain home-screen launch reaches this too — Expo Router falls back to
  // the app's root URL when there is no real link — so the root is compared
  // against rather than merely checking that the path is an absolute URL.
  if (isDeepLink(path, Linking.createURL("/"))) markDirectLaunch();

  try {
    const url = new URL(path);

    // The OAuth browser session receives this URL to finish the token
    // exchange. Expo Router receives the same native intent and would also
    // try to render `/auth/callback`, which is not an app screen. Keep the
    // user on sign-in until Convex Auth flips the authenticated route guard.
    const isOAuthCallback =
      url.protocol === "shelvr:" &&
      ((url.hostname === "auth" && url.pathname === "/callback") ||
        (url.hostname === "" && url.pathname === "/auth/callback"));
    if (isOAuthCallback) {
      return "/sign-in";
    }

    if (url.hostname === "expo-sharing") {
      if (!onboardedOrUnknown()) return "/onboarding";
      try {
        markPendingShareOnDevice();
      } catch {
        // Best-effort: a SecureStore failure loses only the resume flag —
        // it must not stop this recognized share from routing to /share.
      }
      return "/share";
    }
  } catch {
    // Relative/malformed paths aren't share intents — fall through.
  }
  return path;
}

function onboardedOrUnknown(): boolean {
  try {
    return readOnboardedFlag();
  } catch {
    return true;
  }
}
