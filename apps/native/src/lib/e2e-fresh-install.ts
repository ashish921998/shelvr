import { Platform, Settings } from "react-native";

import { isAnonymousAuthEnabled } from "@/lib/anonymous-auth";
import { forgetStoredSession } from "@/lib/auth-storage";
import { forgetOnboarded } from "@/lib/onboarding";
import { clearPending } from "@/lib/pending-onboarding";
import { clearPurchaseBeforeSignIn } from "@/lib/purchase-before-sign-in";
import { clearQueued } from "@/lib/queued-first-save";
import {
  clearPendingShareOnDevice,
  clearShareDiscardedOnDevice,
} from "@/lib/share/pending-share-store";
import { clearSharedPayloads } from "expo-sharing";

const LAUNCH_ARGUMENT = "E2EFreshInstall";

/**
 * Starts an e2e run's launch as a fresh install: signed out, with no
 * onboarding progress, queued first save, unclaimed purchase or link
 * waiting in the share extension's inbox (onboarding takes that as the first
 * save). Keys tied to one account need no clearing, since the
 * next dev sign-in is a new account.
 *
 * The onboarding flows used to reset the simulator's keychain instead. On CI
 * that restarts the test tool's iOS runner, which takes minutes, and the
 * flows timed out waiting for it. Read only on development builds with dev
 * sign-in, the same gate as `e2e-hide-pro.ts`. A device-level key that
 * onboarding reads belongs in this list.
 */
export function startFreshForE2E(): void {
  if (
    !isAnonymousAuthEnabled() ||
    Platform.OS !== "ios" ||
    Settings.get(LAUNCH_ARGUMENT) !== "YES"
  ) {
    return;
  }
  forgetStoredSession();
  forgetOnboarded();
  clearPending();
  clearQueued();
  clearPurchaseBeforeSignIn();
  clearPendingShareOnDevice();
  clearShareDiscardedOnDevice();
  clearSharedPayloads();
}
