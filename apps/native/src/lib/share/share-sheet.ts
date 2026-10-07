import { analytics } from "@/lib/analytics";
import { useEffect, useRef } from "react";
import { AppState, Linking, Platform, Share } from "react-native";

// The two halves of the share sheet that onboarding uses: opening it for a
// link (outgoing) and noticing a share that reached Shelvr (incoming). What a
// caller does with a share it receives, save it or leave it for the share
// screen, stays with the caller.

const SHARE_EXTENSION_SUFFIX = ".expo-sharing-extension";
// iOS ignores a modal presented while the share sheet is still animating out.
export const SHARE_SHEET_DISMISS_MS = 500;

/** Where a share went. "sent" is Android, which cannot say which app got it. */
type ShareSheetResult =
  | "shelvr"
  | "other_app"
  | "sent"
  | "dismissed"
  | "failed";

/**
 * Opens the system share sheet for a link and resolves once it has closed.
 * `arrived` reads whether a share reached Shelvr while the sheet was up; the
 * extension's activity type counts too, since its payload is not always
 * readable yet.
 */
export async function presentShareSheet(
  url: string,
  arrived: () => boolean,
): Promise<ShareSheetResult> {
  let result: Awaited<ReturnType<typeof Share.share>>;
  try {
    result = await Share.share(
      Platform.OS === "ios" ? { url } : { message: url },
    );
  } catch (err) {
    analytics.captureError("onboarding_share_sheet_failed", err);
    return "failed";
  }
  await new Promise((resolve) => setTimeout(resolve, SHARE_SHEET_DISMISS_MS));
  if (arrived() || result.activityType?.endsWith(SHARE_EXTENSION_SUFFIX)) {
    return "shelvr";
  }
  if (result.action !== Share.sharedAction) return "dismissed";
  return Platform.OS === "ios" ? "other_app" : "sent";
}

/**
 * Calls `onArrive` whenever a share may have reached Shelvr: the extension
 * relaunches the app with an expo-sharing URL, and Android hands a share over
 * by bringing the app back to the foreground.
 */
export function useShareArrival(onArrive: () => void, readOnMount: boolean) {
  const onArriveRef = useRef(onArrive);
  useEffect(() => {
    onArriveRef.current = onArrive;
  }, [onArrive]);

  useEffect(() => {
    if (readOnMount) onArriveRef.current();
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") onArriveRef.current();
    });
    const links = Linking.addEventListener("url", ({ url }) => {
      if (url.includes("expo-sharing")) onArriveRef.current();
    });
    return () => {
      appState.remove();
      links.remove();
    };
  }, [readOnMount]);
}
