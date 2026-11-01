import { useEntitlement } from "@/lib/entitlement";
import { useAwaitingOnboardingPurchase } from "@/lib/replay-onboarding";
import { useConvexAuth } from "convex/react";

export function usePlanGate(): { gated: boolean; planUnknown: boolean } {
  const { isAuthenticated } = useConvexAuth();
  const entitlement = useEntitlement();
  const awaitingPurchase = useAwaitingOnboardingPurchase(entitlement.entitled);
  return {
    planUnknown: isAuthenticated && entitlement.loading && !awaitingPurchase,
    gated:
      isAuthenticated &&
      !entitlement.loading &&
      !entitlement.entitled &&
      !awaitingPurchase,
  };
}
