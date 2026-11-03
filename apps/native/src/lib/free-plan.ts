import { api } from "@convex/_generated/api";
import { useEntitlement } from "@/lib/entitlement";
import { useAwaitingOnboardingPurchase } from "@/lib/replay-onboarding";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useConvexAuth } from "convex/react";

export type FreeSaves = {
  limit: number;
  used: number;
  left: number;
  pending: number;
  open: boolean;
};

export type Access =
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
  if (!signedIn || entitlement.entitled || awaitingPurchase) {
    return { kind: "pro" };
  }
  if (entitlement.loading || freeSaves === undefined)
    return { kind: "loading" };
  if (freeSaves === null) return { kind: "locked" };
  return { kind: "free", ...freeSaves };
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
