import { analytics } from "@/lib/analytics";
import { firstSharedUrl } from "@/lib/share/process-share";
import {
  clearPendingShareOnDevice,
  markPendingShareOnDevice,
} from "@/lib/share/pending-share-store";
import { useShareArrival } from "@/lib/share/share-sheet";
import type { RawSharePayload } from "@/lib/share/storage";
import { clearSharedPayloads, getSharedPayloads } from "expo-sharing";
import { useCallback } from "react";

type ShareIntake =
  | { kind: "none" }
  | { kind: "hold" }
  | { kind: "consume"; url: string };

/** The demo saves exactly one shared link, and only while it is still asking
 * for one. Anything else stays in expo-sharing for the share screen. A link
 * the demo takes stays there too, until `releaseSavedShare` hears from the
 * server that this link is the one saved. */
export function decideShareIntake(
  payloads: RawSharePayload[],
  accepting: boolean,
): ShareIntake {
  if (payloads.length === 0) return { kind: "none" };
  if (!accepting || payloads.length > 1) return { kind: "hold" };
  const url = firstSharedUrl(payloads);
  return url === null ? { kind: "hold" } : { kind: "consume", url };
}

/** True when the one share held is this link. Anything else held, beside it
 * or in its place, is a different share and must be kept. That includes a
 * second link inside the same text; a caption around the one link is fine. */
export function holdsOnlyLink(
  payloads: RawSharePayload[],
  url: string,
): boolean {
  if (payloads.length !== 1 || firstSharedUrl(payloads) !== url) return false;
  return (payloads[0].value.match(/https?:\/\//gi) ?? []).length <= 1;
}

// The link last handed to the demo and still held. The app coming back to the
// foreground reads the same payload again; it is handed over once. Kept
// outside the hook so going back and forth between steps does not re-ask.
let handedUrl: string | null = null;

/**
 * Lets go of a shared link once the server has saved that very link. Until
 * then it stays held, so a save that is cancelled, fails, or comes back as an
 * earlier demo item leaves the link for the share screen instead of losing it.
 */
export function releaseSavedShare(url: string) {
  try {
    if (!holdsOnlyLink(getSharedPayloads(), url)) return;
    clearSharedPayloads();
    // A foreground while the save was on its way flags the held link for the
    // share screen. Nothing is held any more, so the flag goes with it.
    clearPendingShareOnDevice();
    handedUrl = null;
  } catch (err) {
    analytics.captureError("onboarding_share_release_failed", err);
  }
}

/**
 * Hands a link shared into the demo from another app to its save. The
 * payload is read directly: useIncomingShare caches its state and would not
 * refresh after a clear followed by a second share of the same link.
 */
export function useIncomingShareUrl({
  canAccept,
  readOnMount,
  onSharedUrl,
}: {
  /** Read at intake time, so it sees in-flight refs as well as render state. */
  canAccept: () => boolean;
  readOnMount: boolean;
  /** A URL the share extension actually delivered to Shelvr. */
  onSharedUrl: (url: string) => void;
}) {
  const consumeShare = useCallback(() => {
    let intake: ShareIntake;
    try {
      intake = decideShareIntake(getSharedPayloads(), canAccept());
    } catch (err) {
      analytics.captureError("onboarding_share_read_failed", err);
      return;
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
    if (intake.kind === "none") handedUrl = null;
    if (intake.kind !== "consume" || intake.url === handedUrl) return;
    handedUrl = intake.url;
    onSharedUrl(intake.url);
  }, [canAccept, onSharedUrl]);

  useShareArrival(consumeShare, readOnMount);
}
