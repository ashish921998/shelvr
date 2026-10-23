import { analytics } from "@/lib/analytics";
import { useCurrentUser } from "@/lib/current-user";
import {
  type EntitlementStatus,
  useEntitlement,
  whenSheetSettled,
} from "@/lib/entitlement";
import { oncePerAccount } from "@/lib/once-per-account";
import { whenTrialPrimerDone } from "@/lib/trial-reminder";
import * as SecureStore from "expo-secure-store";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";

export const welcomeSave = oncePerAccount("welcomeSave");

const ONBOARDED_HERE_KEY = "shelvr.welcomeAfterOnboarding";

/** Onboarding finished on this device, usually before sign-in, so the account that signs in next gets the welcome letter. */
export function noteOnboardingFinished(): void {
  try {
    SecureStore.setItem(ONBOARDED_HERE_KEY, "true");
  } catch (error) {
    analytics.captureError("welcome_save_flag_failed", error);
  }
}

function claimOnboardingWelcome(userId: string): void {
  if (SecureStore.getItem(ONBOARDED_HERE_KEY) !== "true") return;
  welcomeSave.mark(userId);
  SecureStore.setItem(ONBOARDED_HERE_KEY, "");
}

export function justStartedPro(
  before: EntitlementStatus | null,
  status: EntitlementStatus,
): boolean {
  if (before === null) return false;
  const entitledNow = status === "trialing" || status === "pro";
  const entitledBefore =
    before === "trialing" || before === "pro" || before === "lifetime";
  return entitledNow && !entitledBefore;
}

export function useWelcomeSaveTracker(): void {
  const { status, loading } = useEntitlement();
  const { data: user } = useCurrentUser();
  const userId = user?._id ?? null;
  const previous = useRef<{
    userId: string;
    status: EntitlementStatus;
  } | null>(null);

  useEffect(() => {
    if (loading) return;
    if (userId === null) {
      previous.current = null;
      return;
    }
    const before =
      previous.current?.userId === userId ? previous.current.status : null;
    previous.current = { userId, status };
    try {
      claimOnboardingWelcome(userId);
      if (justStartedPro(before, status)) welcomeSave.mark(userId);
    } catch (error) {
      analytics.captureError("welcome_save_flag_failed", error);
    }
  }, [status, loading, userId]);
}

export function useWelcomeSheetVisible(
  userId: string,
  ready: boolean,
): boolean {
  const pending = welcomeSave.usePending(userId);
  const focusCount = useRef(0);
  const [focus, setFocus] = useState<number | null>(null);
  useFocusEffect(
    useCallback(() => {
      focusCount.current += 1;
      setFocus(focusCount.current);
      return () => setFocus(null);
    }, []),
  );
  const [settledFor, setSettledFor] = useState<number | null>(null);
  useEffect(() => {
    if (!pending || focus === null) return;
    let live = true;
    void whenSheetSettled()
      .then(whenTrialPrimerDone)
      .then(() => {
        if (live) setSettledFor(focus);
      });
    return () => {
      live = false;
    };
  }, [pending, focus]);
  return pending && ready && focus !== null && settledFor === focus;
}
