import { useEffect } from "react";
import { useConvexAuth } from "convex/react";
import { observeAuthQueryErrors } from "@/lib/query-auth-recovery";
import { queryClient, restartConvexSubscription } from "@/lib/query-client";

/**
 * While authenticated, re-subscribes Convex queries whose watch errored under
 * a previous identity (e.g. a 401 during a token refresh) so the server
 * re-evaluates them under the current one. Inert while signed out.
 */
export function useConvexQueryHealing(): null {
  const { isAuthenticated } = useConvexAuth();
  useEffect(() => {
    if (!isAuthenticated) return;
    return observeAuthQueryErrors(queryClient, restartConvexSubscription);
  }, [isAuthenticated]);
  return null;
}
