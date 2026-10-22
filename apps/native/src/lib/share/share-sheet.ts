import { analytics } from "@/lib/analytics";
import { useEffect, useRef } from "react";
import { AppState, Linking, Platform, Share } from "react-native";

const SHARE_EXTENSION_SUFFIX = ".expo-sharing-extension";
export const SHARE_SHEET_DISMISS_MS = 500;

type ShareSheetResult =
  | "shelvr"
  | "other_app"
  | "sent"
  | "dismissed"
  | "failed";

export async function presentShareSheet(
  url: string,
  arrived: () => boolean,
  onSettled?: () => void,
): Promise<ShareSheetResult> {
  let result: Awaited<ReturnType<typeof Share.share>>;
  try {
    result = await Share.share(
      Platform.OS === "ios" ? { url } : { message: url },
    );
  } catch (err) {
    onSettled?.();
    analytics.captureError("onboarding_share_sheet_failed", err);
    return "failed";
  }
  onSettled?.();
  await new Promise((resolve) => setTimeout(resolve, SHARE_SHEET_DISMISS_MS));
  if (arrived() || result.activityType?.endsWith(SHARE_EXTENSION_SUFFIX)) {
    return "shelvr";
  }
  if (result.action !== Share.sharedAction) return "dismissed";
  return Platform.OS === "ios" ? "other_app" : "sent";
}

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
