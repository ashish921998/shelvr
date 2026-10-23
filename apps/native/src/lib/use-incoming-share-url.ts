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

export function decideShareIntake(
  payloads: RawSharePayload[],
  accepting: boolean,
): ShareIntake {
  if (payloads.length === 0) return { kind: "none" };
  if (!accepting || payloads.length > 1) return { kind: "hold" };
  const url = firstSharedUrl(payloads);
  return url === null ? { kind: "hold" } : { kind: "consume", url };
}

export function holdsOnlyLink(
  payloads: RawSharePayload[],
  url: string,
): boolean {
  const [only] = payloads;
  if (only === undefined || payloads.length !== 1) return false;
  if (firstSharedUrl(payloads) !== url) return false;
  return (only.value.match(/https?:\/\//gi) ?? []).length <= 1;
}

let handedUrl: string | null = null;

export function releaseSavedShare(url: string) {
  try {
    if (!holdsOnlyLink(getSharedPayloads(), url)) return;
    clearSharedPayloads();
    clearPendingShareOnDevice();
    handedUrl = null;
  } catch (err) {
    analytics.captureError("onboarding_share_release_failed", err);
  }
}

export function useIncomingShareUrl({
  canAccept,
  readOnMount,
  onSharedUrl,
}: {
  canAccept: () => boolean;
  readOnMount: boolean;
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
