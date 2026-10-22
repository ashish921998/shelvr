import { useEffect } from "react";
import { useConvexAuth } from "convex/react";
import { observeAuthQueryErrors } from "@/lib/query-auth-recovery";
import { queryClient, restartConvexSubscription } from "@/lib/query-client";

export function useConvexQueryHealing(): null {
  const { isAuthenticated } = useConvexAuth();
  useEffect(() => {
    if (!isAuthenticated) return;
    return observeAuthQueryErrors(queryClient, restartConvexSubscription);
  }, [isAuthenticated]);
  return null;
}
