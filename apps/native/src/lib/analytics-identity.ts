import { useEffect, useRef } from "react";
import { useConvexAuth } from "convex/react";
import { analytics } from "@/lib/analytics";
import { useCurrentUser } from "@/lib/current-user";
import { queryClient } from "@/lib/query-client";
import {
  clearRecentSavesWidget,
  retryPendingWidgetClear,
} from "@/lib/widget-sync";
import { widgetClearErrorEvent } from "@/lib/widget-clear-error";
import { AppState, Platform } from "react-native";

function useWidgetCleanup(isAuthenticated: boolean, isLoading: boolean) {
  useEffect(() => {
    if (isLoading || Platform.OS !== "ios") return;
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

/**
 * The one session boundary for analytics identity, reacting to the Convex
 * Auth edge: signed-in → identify the user once per account; signed-out →
 * reset PostHog once and drop every Convex query cache entry so its
 * subscriptions stop and a later account can never observe the previous
 * user's data. Other sign-out flows (e.g. notification device sessions) do
 * not reset analytics themselves — this hook is the single owner.
 */
export function useAnalyticsIdentity(): null {
  const { isAuthenticated, isLoading } = useConvexAuth();
  useWidgetCleanup(isAuthenticated, isLoading);
  const { data: user, isFetching } = useCurrentUser();
  const identifiedUserId = useRef<string | undefined>(undefined);
  const clearedUnauthenticatedUserCache = useRef(false);
  const pendingReset = useRef<Promise<void> | undefined>(undefined);

  useEffect(() => {
    // Convex Auth reports signed out while it reads the stored token. Acting
    // then would reset analytics on every cold start.
    if (isLoading) return;
    if (!isAuthenticated) {
      pendingReset.current = analytics.resetIfIdentified();
      identifiedUserId.current = undefined;
      // Convex query keys don't include the authenticated user. Remove every
      // Convex entry once per unauthenticated interval so its subscription
      // stops and a later account can never observe the previous user's data.
      if (!clearedUnauthenticatedUserCache.current) {
        clearedUnauthenticatedUserCache.current = true;
        queryClient.removeQueries({
          predicate: (query) => query.queryKey[0] === "convexQuery",
        });
      }
      return;
    }

    clearedUnauthenticatedUserCache.current = false;

    // Do not identify cached data while the auth-dependent Convex query is
    // reconnecting after sign-in or an account change.
    if (isFetching || !user || identifiedUserId.current === user._id) {
      return;
    }

    // A sign-out reset still waiting on PostHog readiness must land first, or
    // its deferred continuation can wipe the identity set here.
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
