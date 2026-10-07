import { analytics } from "@/lib/analytics";
import { firstSharedUrl } from "@/lib/share/process-share";
import { markPendingShareOnDevice } from "@/lib/share/pending-share-store";
import { useShareArrival } from "@/lib/share/share-sheet";
import type { RawSharePayload } from "@/lib/share/storage";
import { clearSharedPayloads, getSharedPayloads } from "expo-sharing";
import { useCallback } from "react";

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
 * Saves a link shared into the demo from another app. The payload is read
 * directly: useIncomingShare caches its state and would not refresh after a
 * clear followed by a second share of the same link.
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
    if (intake.kind !== "consume") return;
    clearSharedPayloads();
    onSharedUrl(intake.url);
  }, [canAccept, onSharedUrl]);

  useShareArrival(consumeShare, readOnMount);
}
