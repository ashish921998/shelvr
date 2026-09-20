import { useEffect, useRef } from "react";
import { useConvexAuth } from "convex/react";
import { analytics } from "@/lib/analytics";
import { useCurrentUser } from "@/lib/current-user";
import { queryClient } from "@/lib/query-client";

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
  const { data: user, isFetching } = useCurrentUser();
  const identifiedUserId = useRef<string | undefined>(undefined);
  const clearedUnauthenticatedUserCache = useRef(false);

  useEffect(() => {
    // Convex Auth reports signed out while it reads the stored token. Acting
    // then would reset analytics on every cold start.
    if (isLoading) return;
    if (!isAuthenticated) {
      void analytics.resetIfIdentified();
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

    analytics.identify(user._id);
    analytics.capture("auth_completed");
    identifiedUserId.current = user._id;
  }, [isAuthenticated, isLoading, isFetching, user]);

  return null;
}
