import { convexQuery } from "@convex-dev/react-query";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { analytics } from "@/lib/analytics";
import { useCurrentUser } from "@/lib/current-user";
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
 * owns the moment.
 */
export function useSaveRecall(
  items: readonly RecallFeedItem[] | undefined,
  opts: { defer?: boolean } = {},
) {
  const { data: user } = useCurrentUser();
  const userId = user?._id;
  // Freshness is measured from when Home mounted: a save made while the app is
  // open always qualifies, and one made just before launch does too. Anything
  // older belongs to an earlier visit.
  const [mountedAt] = useState(() => Date.now());
  // Bumped when the person acts on the card, so the handled id is re-read.
  const [, setHandledVersion] = useState(0);

  const candidate =
    items && userId && !opts.defer
      ? recallCandidate(items, {
          now: mountedAt,
          handledId: readHandledRecall(userId),
        })
      : null;

  // gcTime ends the subscription soon after the card goes, like the similar
  // strip on item detail.
  const { data: similar } = useQuery({
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

  const candidateId = candidate?._id;
  const loaded = similar !== undefined;
  const reportedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!userId || !candidateId || !loaded) return;
    if (matches.length === 0) {
      writeHandledRecall(userId, candidateId);
      return;
    }
    if (reportedRef.current === candidateId) return;
    reportedRef.current = candidateId;
    analytics.capture("save_recall_shown", { match_count: matches.length });
  }, [userId, candidateId, loaded, matches.length]);

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

  return { visible, matches, opened, dismiss };
}
