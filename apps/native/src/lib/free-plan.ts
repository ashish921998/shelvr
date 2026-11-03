import { api } from "@convex/_generated/api";
import { useEntitlement, usePaywallGuard } from "@/lib/entitlement";
import { useAwaitingOnboardingPurchase } from "@/lib/replay-onboarding";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useConvexAuth } from "convex/react";
import { useCallback } from "react";

export const FREE_SAVES_NUDGE_AT = 2;

export type FreeSaves = {
  limit: number;
  used: number;
  left: number;
  pending: number;
  open: boolean;
};

export type Access =
  | { kind: "signedOut" }
  | { kind: "loading" }
  | { kind: "pro" }
  | ({ kind: "free" } & FreeSaves)
  | { kind: "locked" };

export function accessOf({
  signedIn,
  entitlement,
  awaitingPurchase,
  freeSaves,
}: {
  signedIn: boolean;
  entitlement: { entitled: boolean; loading: boolean };
  awaitingPurchase: boolean;
  freeSaves: FreeSaves | null | undefined;
}): Access {
  if (!signedIn) return { kind: "signedOut" };
  if (entitlement.entitled || awaitingPurchase) return { kind: "pro" };
  if (entitlement.loading || freeSaves === undefined)
    return { kind: "loading" };
  if (freeSaves === null) return { kind: "locked" };
  return { kind: "free", ...freeSaves };
}

export function canBrowse(access: Access): boolean {
  return access.kind === "pro" || access.kind === "free";
}

export function canSave(access: Access): boolean {
  if (access.kind === "pro") return true;
  return access.kind === "free" && access.open && access.left > 0;
}

export function useAccess(): Access {
  const { isAuthenticated } = useConvexAuth();
  const entitlement = useEntitlement();
  const awaitingPurchase = useAwaitingOnboardingPurchase(entitlement.entitled);
  const wantsFreeSaves =
    isAuthenticated && !entitlement.loading && !entitlement.entitled;
  const { data } = useQuery(
    convexQuery(api.freeSaves.getFreeSaves, wantsFreeSaves ? {} : "skip"),
  );
  return accessOf({
    signedIn: isAuthenticated,
    entitlement,
    awaitingPurchase,
    freeSaves: data,
  });
}

export function useFreePlanOpen(): boolean | undefined {
  const { data } = useQuery(convexQuery(api.freeSaves.freePlanOpen, {}));
  return data;
}

/** Runs `action` while the person can still save (Pro, or free saves left), else opens the paywall. */
export function useSaveGuard(placement = "home"): {
  guard: (action?: () => void) => Promise<boolean>;
  loading: boolean;
} {
  const access = useAccess();
  const paywall = usePaywallGuard(placement);
  const free = access.kind === "free" && canSave(access);
  const guard = useCallback(
    async (action?: () => void) => {
      if (!free) return paywall.guard(action);
      action?.();
      return true;
    },
    [free, paywall],
  );
  return { guard, loading: access.kind === "loading" || paywall.loading };
}
