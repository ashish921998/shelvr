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

const shownThisLaunch = new Set<string>();

export function useSaveProgress(
  userId: string | undefined,
  { defer }: { defer: boolean },
) {
  const query = useQuery({
    ...convexQuery(api.items.saveProgress, userId ? {} : "skip"),
  });
  const progress = query.data;
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  const [shownFor, setShownFor] = useState<string | null>(null);
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
        cardVisible: visible && shownFor === userId,
      },
    );
  }, [userId, saved, goal, visible, shownFor]);

  const markShown = useCallback(() => {
    if (userId === undefined) return;
    setShownFor(userId);
    if (shownThisLaunch.has(userId)) return;
    shownThisLaunch.add(userId);
    analytics.capture("save_progress_card_shown", { saved: saved ?? 0 });
  }, [userId, saved]);

  const pending = progress === undefined && !query.isError;
  return {
    card: visible ? progress : null,
    pending: pending && userId !== undefined,
    deferLater: defer || visible || pending,
    firstSession,
    nudgeReady: shouldOfferWeeklyNudge({ firstSession, progress }),
    dismiss,
    markShown,
  };
}
