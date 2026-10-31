import { analytics } from "@/lib/analytics";
import { markPendingShareOnDevice } from "@/lib/share/pending-share-store";
import { getSharedPayloads } from "expo-sharing";

export function holdIncomingShare() {
  try {
    if (getSharedPayloads().length > 0) markPendingShareOnDevice();
  } catch (err) {
    analytics.captureError("onboarding_hold_share_failed", err);
  }
}
