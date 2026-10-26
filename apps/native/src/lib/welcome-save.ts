import { analytics } from "@/lib/analytics";
import { useCurrentUser } from "@/lib/current-user";
import {
  type EntitlementStatus,
  useEntitlement,
  whenSheetSettled,
} from "@/lib/entitlement";
import { oncePerAccount } from "@/lib/once-per-account";
import { whenTrialPrimerDone } from "@/lib/trial-reminder";
import { api } from "@convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
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

/**
 * The first account to sign in after onboarding claims the flag, but only a
 * new one gets the letter: an existing account that walked onboarding again
 * already has saves.
 */
function claimOnboardingWelcome(userId: string, priorSaves: number): void {
  if (SecureStore.getItem(ONBOARDED_HERE_KEY) !== "true") return;
  SecureStore.setItem(ONBOARDED_HERE_KEY, "");
  if (priorSaves === 0) welcomeSave.mark(userId);
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
  const priorSaves = useQuery({
    ...convexQuery(api.items.saveProgress, userId ? {} : "skip"),
  }).data?.saved;
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
      if (justStartedPro(before, status)) welcomeSave.mark(userId);
    } catch (error) {
      analytics.captureError("welcome_save_flag_failed", error);
    }
  }, [status, loading, userId]);

  useEffect(() => {
    if (userId === null || priorSaves === undefined) return;
    try {
      claimOnboardingWelcome(userId, priorSaves);
    } catch (error) {
      analytics.captureError("welcome_save_flag_failed", error);
    }
  }, [userId, priorSaves]);
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
