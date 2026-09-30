import { analytics } from "@/lib/analytics";
import * as SecureStore from "expo-secure-store";
import { useSyncExternalStore } from "react";

/**
 * A prompt that is queued once per account and shown once: `pending` from
 * the moment it is earned until the prompt finishes, then `done` for good.
 * Keyed per account so a second account on the same phone gets its own.
 * Screens subscribe with `usePending`, so a flag set while a native sheet
 * covers the screen (no focus change) still reaches it. Storage that
 * cannot be read reads as not pending, so a broken keychain hides a prompt
 * rather than crashing the screen showing it.
 */
export function oncePerAccount(name: string) {
  const key = (userId: string) => `shelvr.${name}.${userId}`;
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of listeners) listener();
  };
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  const isPending = (userId: string) => {
    try {
      return SecureStore.getItem(key(userId)) === "pending";
    } catch (error) {
      analytics.captureError("prompt_flag_read_failed", error);
      return false;
    }
  };

  return {
    /** Queue the prompt, unless this account already has it or finished it. */
    mark(userId: string): void {
      const current = SecureStore.getItem(key(userId));
      if (current === null || current === "") {
        SecureStore.setItem(key(userId), "pending");
        notify();
      }
    },
    isPending,
    finish(userId: string): void {
      try {
        SecureStore.setItem(key(userId), "done");
      } catch (error) {
        analytics.captureError("prompt_flag_write_failed", error);
      }
      notify();
    },
    usePending(userId: string | undefined): boolean {
      return useSyncExternalStore(subscribe, () =>
        userId ? isPending(userId) : false,
      );
    },
  };
}
