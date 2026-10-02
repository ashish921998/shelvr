import { analytics } from "@/lib/analytics";
import {
  dismissSaveProgressCard,
  isFirstSession,
  isSaveProgressCardDismissed,
  shouldOfferWeeklyNudge,
} from "@/lib/first-share";
import { trackSaveGoal } from "@/lib/save-goal";
import { api } from "@convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";

// Accounts whose card was already reported shown in this launch.
const shownThisLaunch = new Set<string>();

/**
 * A new shelf's first three real saves (the onboarding demo does not count):
 * whether Home shows the progress card, and whether the weekly nudge may ask.
 * `defer` holds the card back while another Home card owns the moment.
 */
export function useSaveProgress(
  userId: string | undefined,
  { defer }: { defer: boolean },
) {
  const query = useQuery({
    ...convexQuery(api.items.saveProgress, userId ? {} : "skip"),
  });
  const progress = query.data;
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  // Read once per account per launch; the first read of a new account marks
  // this launch as its first session.
  const firstSession = useMemo(
    () => (userId ? isFirstSession(userId) : true),
    [userId],
  );
  const visible: boolean =
    userId !== undefined &&
    !defer &&
    progress !== undefined &&
    progress.saved < progress.goal &&
    dismissedFor !== userId &&
    !isSaveProgressCardDismissed(userId);
  const dismiss = useCallback(() => {
    if (userId === undefined) return;
    dismissSaveProgressCard(userId);
    setDismissedFor(userId);
    analytics.capture("save_progress_card_action", {
      action: "dismiss",
      saved: progress?.saved ?? 0,
    });
  }, [userId, progress?.saved]);

  const saved = progress?.saved;
  const goal = progress?.goal;
  useEffect(() => {
    if (userId === undefined || saved === undefined || goal === undefined) {
      return;
    }
    trackSaveGoal(
      userId,
      { saved, goal },
      {
        cardDismissed: isSaveProgressCardDismissed(userId),
        cardVisible: visible,
      },
    );
  }, [userId, saved, goal, visible]);

  // Called by the card itself once Home shows it focused, so a card that
  // never reached the screen is not counted.
  const markShown = useCallback(() => {
    if (userId === undefined || shownThisLaunch.has(userId)) return;
    shownThisLaunch.add(userId);
    analytics.capture("save_progress_card_shown", { saved: saved ?? 0 });
  }, [userId, saved]);

  // A failed read settles as "no card", so it never holds other cards back.
  const pending = progress === undefined && !query.isError;
  return {
    /** What the card shows, or null when it is not on Home. */
    card: visible ? progress : null,
    /** A signed-in account's count has not loaded yet, so the card may
     * still come. */
    pending: pending && userId !== undefined,
    /** Later Home prompts wait while an earlier card holds the slot, and
     * while this one is up or may still come. */
    deferLater: defer || visible || pending,
    firstSession,
    nudgeReady: shouldOfferWeeklyNudge({ firstSession, progress }),
    dismiss,
    markShown,
  };
}
