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

export function useSaveRecall<Item extends RecallFeedItem>(
  items: readonly Item[] | undefined,
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
  const [now, setNow] = useState(() => Date.now());
  useFocusEffect(
    useCallback(() => {
      setNow(Date.now());
      const interval = setInterval(() => setNow(Date.now()), 60_000);
      return () => clearInterval(interval);
    }, []),
  );
  const [, setHandledVersion] = useState(0);

  const candidate =
    items && userId && home && !opts.defer
      ? recallCandidate(items, {
          now,
          handledIds: readHandledRecall(userId),
        })
      : null;

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

  return { visible, pending, saved: candidate, matches, opened, dismiss };
}
