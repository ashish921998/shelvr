import { useEffect, useRef } from "react";
import { useConvexAuth } from "convex/react";
import { analytics } from "@/lib/analytics";
import { useCurrentUser } from "@/lib/current-user";
import { queryClient } from "@/lib/query-client";
import {
  clearRecentSavesWidget,
  hasRecentSavesWidget,
  retryPendingWidgetClear,
} from "@/lib/widget-sync";
import { widgetClearErrorEvent } from "@/lib/widget-clear-error";
import { AppState } from "react-native";

function useWidgetCleanup(isAuthenticated: boolean, isLoading: boolean) {
  useEffect(() => {
    if (isLoading || !hasRecentSavesWidget()) return;
    let active = true;
    let pending = false;
    let completed = false;
    const clear = async (beginBoundary = false) => {
      if (!active || pending || (completed && !isAuthenticated)) return;
      pending = true;
      try {
        const cleared = await (beginBoundary
          ? clearRecentSavesWidget()
          : retryPendingWidgetClear());
        if (!active) return;
        completed = true;
        if (cleared && !isAuthenticated) analytics.capture("widget_cleared");
      } catch (error) {
        if (!active) return;
        const event = widgetClearErrorEvent(error);
        analytics.captureError(event, new Error(event));
      } finally {
        pending = false;
      }
    };
    void clear(!isAuthenticated);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void clear();
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, [isAuthenticated, isLoading]);
}

export function useAnalyticsIdentity(): null {
  const { isAuthenticated, isLoading } = useConvexAuth();
  useWidgetCleanup(isAuthenticated, isLoading);
  const { data: user, isFetching } = useCurrentUser();
  const identifiedUserId = useRef<string | undefined>(undefined);
  const clearedUnauthenticatedUserCache = useRef(false);
  const pendingReset = useRef<Promise<void> | undefined>(undefined);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      pendingReset.current = analytics.resetIfIdentified();
      identifiedUserId.current = undefined;
      if (!clearedUnauthenticatedUserCache.current) {
        clearedUnauthenticatedUserCache.current = true;
        queryClient.removeQueries({
          predicate: (query) => query.queryKey[0] === "convexQuery",
        });
      }
      return;
    }

    clearedUnauthenticatedUserCache.current = false;

    if (isFetching || !user || identifiedUserId.current === user._id) {
      return;
    }

    let cancelled = false;
    void Promise.resolve(pendingReset.current).then(() => {
      if (cancelled || identifiedUserId.current === user._id) return;
      analytics.identify(user._id);
      analytics.capture("auth_completed");
      identifiedUserId.current = user._id;
    });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isLoading, isFetching, user]);

  return null;
}
