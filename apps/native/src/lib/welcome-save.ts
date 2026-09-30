import { analytics } from "@/lib/analytics";
import { useCurrentUser } from "@/lib/current-user";
import {
  type EntitlementStatus,
  useEntitlement,
  whenSheetSettled,
} from "@/lib/entitlement";
import { oncePerAccount } from "@/lib/once-per-account";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The "save your next real thing" step right after someone starts Pro.
 * Most trial cancellations come on day 0 or 1, before the app has filed
 * anything real, so the moment after purchase goes straight to one save
 * instead of a feature list. Once per account: queued by the purchase,
 * finished when Home has shown it.
 */
export const welcomeSave = oncePerAccount("welcomeSave");

/** A status that just turned entitled: a trial or plan bought in this launch,
 * not an account that was already Pro when the app opened. */
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

/**
 * Watches the entitlement and queues the step when Pro starts while the app
 * is open. Mounted once in the app layout, so a purchase from any paywall
 * placement counts; Home decides when to show it.
 */
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
    if (!justStartedPro(before, status)) return;
    try {
      welcomeSave.mark(userId);
    } catch (error) {
      analytics.captureError("welcome_save_flag_failed", error);
    }
  }, [status, loading, userId]);
}

/**
 * Whether the sheet may present now: queued, Home says `ready`, Home is the
 * focused screen (a purchase behind an item or the share screen waits), and
 * no RevenueCat sheet is up or still sliding away. Re-checked every time
 * Home regains focus, so a sheet opened elsewhere in between is waited out.
 */
export function useWelcomeSheetVisible(
  userId: string,
  ready: boolean,
): boolean {
  const pending = welcomeSave.usePending(userId);
  // Each stretch of focus gets its own id, and only a settle that finished
  // within the current one counts.
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
    void whenSheetSettled().then(() => {
      if (live) setSettledFor(focus);
    });
    return () => {
      live = false;
    };
  }, [pending, focus]);
  return pending && ready && focus !== null && settledFor === focus;
}
