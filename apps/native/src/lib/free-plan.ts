import { api } from "@convex/_generated/api";
import { useEntitlement } from "@/lib/entitlement";
import { useAwaitingOnboardingPurchase } from "@/lib/onboarding-handoff";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useConvexAuth } from "convex/react";
import { accessOf, type Access } from "@/lib/access";

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
    freeSaves: isError && data === undefined ? null : data,
  });
}

export function useFreePlanOpen(): boolean | undefined {
  const { data } = useQuery(convexQuery(api.freeSaves.freePlanOpen, {}));
  return data;
}
