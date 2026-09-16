import { readOnboardedFlag } from "@/lib/onboarding";
import { markPendingShareOnDevice } from "@/lib/share/pending-share-store";

// expo-sharing launches the app with a `<scheme>://expo-sharing` deep link when
// something is shared into Shelvr from another app. Route those to the receiver
// screen; leave every other deep link untouched.
//
// Before onboarding, the demo step consumes the share itself, so the resume
// flag stays unset. Otherwise mark it: a signed-out user is redirected away
// from `/share`, and the flag resumes the share after sign-in.
export function redirectSystemPath({
  path,
}: {
  path: string;
  initial: boolean;
}) {
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
