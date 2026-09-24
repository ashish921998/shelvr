import { convexQuery } from "@convex-dev/react-query";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useQuery } from "@tanstack/react-query";
import { useFocusEffect, useSegments } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import { analytics } from "@/lib/analytics";
import { useCurrentUser } from "@/lib/current-user";
import { isHomeRootRoute } from "@/lib/feedback";
import {
  olderMatches,
  readHandledRecall,
  recallCandidate,
  writeHandledRecall,
} from "@/lib/save-recall";

type RecallFeedItem = {
  _id: Id<"items">;
  _creationTime: number;
  status: "processing" | "ready" | "failed";
};

/**
 * Drives the save recall card on Home. The card is about the newest save: it
 * shows once that save is ready and some of its similar items are old enough
 * to be worth bringing back, and stays until the person opens one or
 * dismisses it. A save with no such matches is marked handled so its similar
 * items are not read again. `defer` holds evaluation while another Home card
 * owns the moment. Nothing is evaluated, recorded, or marked handled while
 * another route covers Home, matching the feedback and review prompts, and
 * nothing is recorded while the app is in the background. `pending` is true
 * while the newest save's similar items are still loading, so the caller can
 * hold a competing Home card until the recall card has had its chance.
 */
export function useSaveRecall(
  items: readonly RecallFeedItem[] | undefined,
  opts: { defer?: boolean } = {},
) {
  const { data: user } = useCurrentUser();
  const userId = user?._id;
  const home = isHomeRootRoute(useSegments());
  const [appState, setAppState] = useState(AppState.currentState);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", setAppState);
    return () => subscription.remove();
  }, []);
  const active = appState === "active";
  // Freshness is measured against the current time, refreshed whenever Home
  // gains focus and every minute while it stays focused. Home can stay
  // mounted underneath a stacked screen (share, item detail); a timestamp
  // captured once at mount would let a save keep qualifying indefinitely
  // instead of aging out after RECALL_FRESH_MS.
  const [now, setNow] = useState(() => Date.now());
  useFocusEffect(
    useCallback(() => {
      setNow(Date.now());
      const interval = setInterval(() => setNow(Date.now()), 60_000);
      return () => clearInterval(interval);
    }, []),
  );
  // Bumped when the person acts on the card, so the handled ids are re-read.
  const [, setHandledVersion] = useState(0);

  const candidate =
    items && userId && home && !opts.defer
      ? recallCandidate(items, {
          now,
          handledIds: readHandledRecall(userId),
        })
      : null;

  // gcTime ends the subscription soon after the card goes, like the similar
  // strip on item detail.
  const { data: similar, isError } = useQuery({
    ...convexQuery(
      api.items.similarItems,
      candidate ? { id: candidate._id } : "skip",
    ),
    gcTime: 30_000,
  });

  const savedAt = candidate?._creationTime;
  const matches = useMemo(
    () =>
      similar && savedAt !== undefined
        ? olderMatches(similar, { _creationTime: savedAt })
        : [],
    [similar, savedAt],
  );
  const visible = candidate !== null && matches.length > 0;
  const pending = candidate !== null && similar === undefined && !isError;

  const candidateId = candidate?._id;
  const loaded = similar !== undefined;
  const reportedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!userId || !candidateId || !loaded || !active) return;
    if (matches.length === 0) {
      // No rerender needed: every render re-reads the handled ids, so the
      // next one (including a late match arriving) drops this candidate.
      writeHandledRecall(userId, candidateId);
      return;
    }
    if (reportedRef.current === candidateId) return;
    reportedRef.current = candidateId;
    analytics.capture("save_recall_shown", { match_count: matches.length });
  }, [userId, candidateId, loaded, active, matches.length]);

  const finish = useCallback(
    (event: "save_recall_opened" | "save_recall_dismissed") => {
      if (!userId || !candidateId) return;
      analytics.capture(event, { match_count: matches.length });
      writeHandledRecall(userId, candidateId);
      setHandledVersion((version) => version + 1);
    },
    [userId, candidateId, matches.length],
  );
  const opened = useCallback(() => finish("save_recall_opened"), [finish]);
  const dismiss = useCallback(() => finish("save_recall_dismissed"), [finish]);

  return { visible, pending, matches, opened, dismiss };
}
