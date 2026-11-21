import { saveErrorCode } from "@convex/model/saveErrors";
import { useRouter } from "expo-router";
import { useCallback } from "react";
import { canSave, saveWaiting, type Access } from "@/lib/access";
import { openPaywallAnswer } from "@/lib/entitlement";
import { useAccess } from "@/lib/free-plan";
import { recordBlockedAction, resumeBlockedAction } from "@/lib/paywall-funnel";

export type ProPlacement =
  | "home"
  | "add"
  | "share"
  | "remove_place"
  | "mark_visited"
  | "passport"
  | "passport_friend_places"
  | "make_plan"
  | "plan_trip"
  | "shared_list"
  | "edit_places"
  | "item_detail"
  | "plan_vote";

export type Admission = "go" | "wait" | "paywalled";

const FREE_SAVE_PLACEMENTS: ReadonlySet<ProPlacement> = new Set(["home"]);

function admission(access: Access, freeSaves: boolean): Admission {
  if (saveWaiting(access)) return "wait";
  if (access.kind === "pro") return "go";
  return freeSaves && canSave(access) ? "go" : "paywalled";
}

export function useProGate(placement: ProPlacement): {
  admit: () => Promise<Admission>;
  denied: (error: unknown) => Promise<boolean>;
  blocked: () => Promise<void>;
  passed: () => void;
  loading: boolean;
} {
  const router = useRouter();
  const access = useAccess();
  const verdict = admission(access, FREE_SAVE_PLACEMENTS.has(placement));
  const pro = access.kind === "pro";

  const blocked = useCallback(async () => {
    recordBlockedAction(placement);
    await openPaywallAnswer(router, placement);
  }, [placement, router]);

  const admit = useCallback(async () => {
    if (verdict === "paywalled") await blocked();
    return verdict;
  }, [verdict, blocked]);

  const denied = useCallback(
    async (error: unknown) => {
      if (saveErrorCode(error) !== "pro_required" || pro) return false;
      await blocked();
      return true;
    },
    [pro, blocked],
  );

  const passed = useCallback(() => {
    if (pro) resumeBlockedAction(placement);
  }, [pro, placement]);

  return { admit, denied, blocked, passed, loading: verdict === "wait" };
}
