import { convexQuery } from "@convex-dev/react-query";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useQuery } from "@tanstack/react-query";
import { useFocusEffect } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import { analytics } from "@/lib/analytics";

// The "Open this next" card on Home: one save worth going back to, picked on
// the server with the save reminder rules (an unread article, or a recipe not
// looked at lately). It stays until the person opens it or says not now.

const HOUR_MS = 60 * 60 * 1000;

/** The clock sent to the query, floored to the hour so the query's cache and
 * subscription hold between renders. The rules count in days. */
export function hourFloor(now: number): number {
  return now - (now % HOUR_MS);
}

// Keyed per account, like the other Home prompts.
const dismissedKey = (userId: string) => `shelvr.nextUpDismissed.${userId}`;
const DISMISSED_LIMIT = 50; // NEXT_UP_SKIP_MAX on the server

function readDismissedNextUp(userId: string): Id<"items">[] {
  const raw = SecureStore.getItem(dismissedKey(userId));
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((id): id is Id<"items"> => typeof id === "string")
      : [];
  } catch {
    return [];
  }
}

function writeDismissedNextUp(userId: string, itemId: Id<"items">): void {
  const dismissed = readDismissedNextUp(userId).filter((id) => id !== itemId);
  dismissed.push(itemId);
  try {
    SecureStore.setItem(
      dismissedKey(userId),
      JSON.stringify(dismissed.slice(-DISMISSED_LIMIT)),
    );
  } catch (error) {
    // useNextUp still skips it while Home is mounted.
    analytics.captureError("next_up_dismiss_store_failed", error);
  }
}

/**
 * The save the card names, or null. `enabled` is false while Pro is not
 * active, so a locked account never subscribes to it. Dismissed saves go to
 * the server as `skip`, so "Not now" moves the card on to the next save.
 */
export function useNextUp(userId: string | undefined, enabled: boolean) {
  const [now, setNow] = useState(() => hourFloor(Date.now()));
  const refreshNow = useCallback(() => setNow(hourFloor(Date.now())), []);
  // Home gaining focus, and the app returning to the foreground: Home can sit
  // in the background overnight without ever losing focus.
  useFocusEffect(refreshNow);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") refreshNow();
    });
    return () => subscription.remove();
  }, [refreshNow]);
  // Dismissed while Home is mounted, kept here too in case the store write
  // failed.
  const [dismissedNow, setDismissedNow] = useState<{
    userId: string;
    ids: Id<"items">[];
  } | null>(null);

  const skip = useMemo(() => {
    if (!userId) return [];
    const stored = readDismissedNextUp(userId);
    const session = dismissedNow?.userId === userId ? dismissedNow.ids : [];
    const added = session.filter((id) => !stored.includes(id));
    return [...stored, ...added].slice(-DISMISSED_LIMIT);
  }, [userId, dismissedNow]);
  // gcTime ends an old subscription soon after the hour or the skip list
  // moves on, instead of keeping each one alive for the default day.
  const { data } = useQuery({
    ...convexQuery(
      api.items.nextUp,
      userId && enabled ? { now, skip } : "skip",
    ),
    gcTime: 30_000,
  });
  // The previous answer can still name the save just dismissed until the
  // new one arrives.
  const next = data && userId && !skip.includes(data.item._id) ? data : null;

  // Reported by the card as it renders, not here: another Home card can hold
  // the slot while this save is picked. Once per save per Home mount.
  const shownRef = useRef<string | null>(null);
  const nextId = next?.item._id;
  const kind = next?.kind;
  const shown = useCallback(() => {
    if (!nextId || !kind || shownRef.current === nextId) return;
    shownRef.current = nextId;
    analytics.capture("next_up_shown", { kind });
  }, [nextId, kind]);

  const opened = useCallback(() => {
    if (kind) analytics.capture("next_up_opened", { kind });
  }, [kind]);
  const dismiss = useCallback(() => {
    if (!userId || !nextId || !kind) return;
    analytics.capture("next_up_dismissed", { kind });
    writeDismissedNextUp(userId, nextId);
    setDismissedNow((current) => ({
      userId,
      ids: [...(current?.userId === userId ? current.ids : []), nextId],
    }));
  }, [userId, nextId, kind]);

  return { next, shown, opened, dismiss };
}
