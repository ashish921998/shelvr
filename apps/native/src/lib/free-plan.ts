import { api } from "@convex/_generated/api";
import { useEntitlement, usePaywallGuard } from "@/lib/entitlement";
import { useAwaitingOnboardingPurchase } from "@/lib/replay-onboarding";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useConvexAuth } from "convex/react";
import { useCallback } from "react";
import { accessOf, canSave, type Access } from "@/lib/access";

export function useAccess(): Access {
  const { isAuthenticated } = useConvexAuth();
  const entitlement = useEntitlement();
  const awaitingPurchase = useAwaitingOnboardingPurchase(entitlement.entitled);
  const wantsFreeSaves =
    isAuthenticated && !entitlement.loading && !entitlement.entitled;
  const { data, isError } = useQuery(
    convexQuery(api.freeSaves.getFreeSaves, wantsFreeSaves ? {} : "skip"),
  );
  return accessOf({
    signedIn: isAuthenticated,
    entitlement,
    awaitingPurchase,
    freeSaves: isError ? null : data,
  });
}

export function useFreePlanOpen(): boolean | undefined {
  const { data } = useQuery(convexQuery(api.freeSaves.freePlanOpen, {}));
  return data;
}

export function useSaveGuard(placement = "home"): {
  guard: (action?: () => void) => Promise<boolean>;
  loading: boolean;
} {
  const access = useAccess();
  const paywall = usePaywallGuard(placement);
  const free = access.kind === "free" && canSave(access);
  const paywallGuard = paywall.guard;
  const guard = useCallback(
    async (action?: () => void) => {
      if (!free) return paywallGuard(action);
      action?.();
      return true;
    },
    [free, paywallGuard],
  );
  return { guard, loading: access.kind === "loading" || paywall.loading };
}
