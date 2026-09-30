import { analytics } from "@/lib/analytics";
import { useCurrentUser } from "@/lib/current-user";
import { useEntitlement } from "@/lib/entitlement";
import * as SecureStore from "expo-secure-store";
import { useEffect, useRef } from "react";

/**
 * The "save your next real thing" step right after someone starts Pro.
 * Most trial cancellations come on day 0 or 1, before the app has filed
 * anything real, so the moment after purchase goes straight to one save
 * instead of a feature list. Once per account: `pending` from the purchase
 * until Home has shown it, then `done`.
 */

const welcomeKey = (userId: string) => `shelvr.welcomeSave.${userId}`;

type Status = ReturnType<typeof useEntitlement>["status"];

/** A status that just turned entitled: a trial or plan bought in this launch,
 * not an account that was already Pro when the app opened. */
export function justStartedPro(before: Status | null, status: Status): boolean {
  if (before === null) return false;
  const entitledNow = status === "trialing" || status === "pro";
  const entitledBefore =
    before === "trialing" || before === "pro" || before === "lifetime";
  return entitledNow && !entitledBefore;
}

// The purchase lands under a native sheet, so Home never loses focus and
// has to hear about the flag rather than re-read it on focus.
const listeners = new Set<() => void>();

export function subscribeWelcome(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify() {
  for (const listener of listeners) listener();
}

export function markWelcomePending(userId: string): void {
  const current = SecureStore.getItem(welcomeKey(userId));
  if (current === null || current === "") {
    SecureStore.setItem(welcomeKey(userId), "pending");
    notify();
  }
}

export function isWelcomePending(userId: string): boolean {
  return SecureStore.getItem(welcomeKey(userId)) === "pending";
}

export function finishWelcome(userId: string): void {
  SecureStore.setItem(welcomeKey(userId), "done");
  notify();
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
  const previous = useRef<{ userId: string; status: Status } | null>(null);

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
      markWelcomePending(userId);
    } catch (error) {
      analytics.captureError("welcome_save_flag_failed", error);
    }
  }, [status, loading, userId]);
}
