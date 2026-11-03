import { api } from "@convex/_generated/api";
import { useEntitlement, usePaywallGuard } from "@/lib/entitlement";
import { useAwaitingOnboardingPurchase } from "@/lib/replay-onboarding";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useConvexAuth } from "convex/react";
import { useCallback } from "react";
import { accessOf, canSave, saveWaiting, type Access } from "@/lib/access";

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
    freeSaves: data ?? (isError ? null : undefined),
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
  const waiting = saveWaiting(access);
  const free = access.kind === "free" && canSave(access);
  const paywallGuard = paywall.guard;
  const guard = useCallback(
    async (action?: () => void) => {
      if (waiting) return false;
      if (!free) return paywallGuard(action);
      action?.();
      return true;
    },
    [waiting, free, paywallGuard],
  );
  return { guard, loading: waiting || paywall.loading };
}
