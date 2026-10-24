import { rememberSheetLink } from "@/lib/deferred-sheet-link";
import { resolveRootHref } from "@/lib/home-href";
import { readOnboardedFlag } from "@/lib/onboarding";
import { markPendingShareOnDevice } from "@/lib/share/pending-share-store";
import { isDeepLink, markDirectLaunch } from "@/lib/splash/launch-intent";
import * as Linking from "expo-linking";

export function redirectSystemPath({
  path,
  initial,
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

    const appScheme = ["shelvr:", "shelvr-dev:", "shelvr-preview:"].includes(
      url.protocol,
    );
    const isOAuthCallback =
      appScheme &&
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

    // A widget opens a running app at its root, which would otherwise land on Map.
    if (!initial && appScheme && url.hostname === "" && url.pathname === "/") {
      return resolveRootHref("/") + url.search + url.hash;
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
