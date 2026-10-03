import type { TextMessageKey } from "@/locales/message-types";
import { analytics } from "@/lib/analytics";
import { firstSharedUrl } from "@/lib/share/process-share";
import { markPendingShareOnDevice } from "@/lib/share/pending-share-store";
import type { RawSharePayload } from "@/lib/share/storage";
import { clearSharedPayloads, getSharedPayloads } from "expo-sharing";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Linking, Share } from "react-native";

const SHARE_EXTENSION_SUFFIX = ".expo-sharing-extension";
// iOS ignores a modal presented while the share sheet is still animating out.
export const SHARE_SHEET_DISMISS_MS = 500;

type ShareIntake =
  | { kind: "none" }
  | { kind: "hold" }
  | { kind: "consume"; url: string };

/** The demo saves exactly one shared link, and only while it is still asking
 * for one. Anything else stays in expo-sharing for the share screen, so no
 * payload is cleared that the demo does not save. */
export function decideShareIntake(
  payloads: RawSharePayload[],
  accepting: boolean,
): ShareIntake {
  if (payloads.length === 0) return { kind: "none" };
  if (!accepting || payloads.length > 1) return { kind: "hold" };
  const url = firstSharedUrl(payloads);
  return url === null ? { kind: "hold" } : { kind: "consume", url };
}

/**
 * Reads links shared into the demo. The share extension relaunches the app
 * with an expo-sharing URL. The payload is read directly: useIncomingShare
 * caches its state and would not refresh after a clear followed by a second
 * share of the same link.
 */
export function useIncomingShareUrl({
  canAccept,
  readOnMount,
  onSharedUrl,
  onDirectUrl,
  onError,
}: {
  /** Read at intake time, so it sees in-flight refs as well as render state. */
  canAccept: () => boolean;
  readOnMount: boolean;
  /** A URL the share extension actually delivered to Shelvr. */
  onSharedUrl: (url: string) => void;
  /** A sample saved only because the system share sheet failed to open. */
  onDirectUrl: (url: string) => void;
  onError: (error: TextMessageKey | null) => void;
}) {
  const [shareSheetOpen, setShareSheetOpen] = useState(false);

  const consumeShare = useCallback((): boolean => {
    let intake: ShareIntake;
    try {
      intake = decideShareIntake(getSharedPayloads(), canAccept());
    } catch (err) {
      analytics.captureError("onboarding_share_read_failed", err);
      return false;
    }
    if (intake.kind === "hold") {
      // Before onboarding, +native-intent leaves the resume flag unset, so a
      // share the demo will not save is flagged here for the share screen.
      try {
        markPendingShareOnDevice();
      } catch (err) {
        analytics.captureError("onboarding_hold_share_failed", err);
      }
    }
    if (intake.kind !== "consume") return false;
    clearSharedPayloads();
    onSharedUrl(intake.url);
    return true;
  }, [canAccept, onSharedUrl]);

  // iOS opens the real share sheet over a sample, so the first save goes
  // through the same Shelvr tile the user will tap in other apps.
  const shareSample = useCallback(
    async (url: string) => {
      onError(null);
      setShareSheetOpen(true);
      let result: Awaited<ReturnType<typeof Share.share>>;
      try {
        result = await Share.share({ url });
      } catch (err) {
        analytics.captureError("onboarding_share_sheet_failed", err);
        setShareSheetOpen(false);
        onDirectUrl(url);
        return;
      }
      await new Promise((resolve) =>
        setTimeout(resolve, SHARE_SHEET_DISMISS_MS),
      );
      setShareSheetOpen(false);
      if (result.action !== Share.sharedAction) return;
      if (consumeShare()) return;
      if (result.activityType?.endsWith(SHARE_EXTENSION_SUFFIX)) {
        onSharedUrl(url);
      } else {
        onError("demo.pickShelvr");
      }
    },
    [consumeShare, onDirectUrl, onError, onSharedUrl],
  );

  const consumeShareRef = useRef(consumeShare);
  useEffect(() => {
    consumeShareRef.current = consumeShare;
  }, [consumeShare]);

  useEffect(() => {
    if (readOnMount) consumeShareRef.current();
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") consumeShareRef.current();
    });
    const links = Linking.addEventListener("url", ({ url }) => {
      if (url.includes("expo-sharing")) consumeShareRef.current();
    });
    return () => {
      appState.remove();
      links.remove();
    };
  }, [readOnMount]);

  return { shareSheetOpen, shareSample };
}
