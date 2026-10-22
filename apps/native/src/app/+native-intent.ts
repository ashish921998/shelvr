import { rememberSheetLink } from "@/lib/deferred-sheet-link";
import { readOnboardedFlag } from "@/lib/onboarding";
import { markPendingShareOnDevice } from "@/lib/share/pending-share-store";
import { isDeepLink, markDirectLaunch } from "@/lib/splash/launch-intent";
import * as Linking from "expo-linking";

export function redirectSystemPath({
  path,
}: {
  path: string;
  initial: boolean;
}) {
  if (isDeepLink(path, Linking.createURL("/"))) {
    markDirectLaunch();
    rememberSheetLink(path);
  }

  try {
    const url = new URL(path);

    const isOAuthCallback =
      ["shelvr:", "shelvr-dev:", "shelvr-preview:"].includes(url.protocol) &&
      ((url.hostname === "auth" && url.pathname === "/callback") ||
        (url.hostname === "" && url.pathname === "/auth/callback"));
    const isClaimedOAuthCallback =
      url.protocol === "https:" &&
      url.hostname === "shelvr-web.vercel.app" &&
      url.pathname === "/auth/callback";
    if (isOAuthCallback || isClaimedOAuthCallback) {
      return "/sign-in";
    }

    if (url.hostname === "expo-sharing") {
      if (!onboardedOrUnknown()) return "/onboarding";
      markPendingShareQuietly();
      return "/share";
    }
  } catch {}
  return path;
}

function markPendingShareQuietly(): void {
  try {
    markPendingShareOnDevice();
  } catch {}
}

function onboardedOrUnknown(): boolean {
  try {
    return readOnboardedFlag();
  } catch {
    return true;
  }
}
