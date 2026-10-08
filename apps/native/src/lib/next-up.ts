import { convexQuery } from "@convex-dev/react-query";
import { api } from "@convex/_generated/api";
import { useQuery } from "@tanstack/react-query";
import { useFocusEffect } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { useCallback, useRef, useState } from "react";
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
const DISMISSED_LIMIT = 50;

function readDismissedNextUp(userId: string): string[] {
  const raw = SecureStore.getItem(dismissedKey(userId));
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === "string")
      : [];
  } catch {
    return [];
  }
}

function writeDismissedNextUp(userId: string, itemId: string): void {
  const dismissed = readDismissedNextUp(userId).filter((id) => id !== itemId);
  dismissed.push(itemId);
  SecureStore.setItem(
    dismissedKey(userId),
    JSON.stringify(dismissed.slice(-DISMISSED_LIMIT)),
  );
}

/**
 * The save the card names, or null. `enabled` is false while Pro is not
 * active, so a locked account never subscribes to it. A dismissed save stays
 * hidden; the card comes back when the server picks a different one.
 */
export function useNextUp(userId: string | undefined, enabled: boolean) {
  const [now, setNow] = useState(() => hourFloor(Date.now()));
  useFocusEffect(useCallback(() => setNow(hourFloor(Date.now())), []));
  const [, setDismissedVersion] = useState(0);

  const { data } = useQuery(
    convexQuery(api.items.nextUp, userId && enabled ? { now } : "skip"),
  );
  const next =
    data && userId && !readDismissedNextUp(userId).includes(data.item._id)
      ? data
      : null;

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
    setDismissedVersion((version) => version + 1);
  }, [userId, nextId, kind]);

  return { next, shown, opened, dismiss };
}
