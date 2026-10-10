import { t } from "@/lib/i18n";
import { analytics } from "@/lib/analytics";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { isAiConsentRequired } from "@convex/model/aiConsent";
import type { PlanPlace } from "@convex/model/plan";
import { useAction } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";

export type { PlanPlace };

type PlanState =
  | { status: "loading" }
  | { status: "ready"; places: PlanPlace[]; considered: number }
  | { status: "ai_off" }
  | { status: "error" };

/** Where a shared plan sends people who don't have Shelvr yet. */
export const PLAN_SHARE_URL = "https://shelvr-web.vercel.app/?ct=plan-share";

/**
 * Runs `plans.makePlan` for a space once on mount, and again on `retry`.
 * A late answer from an earlier run never overwrites a newer one.
 */
export function useMakePlan(spaceId: Id<"spaces">, locale: string) {
  const makePlan = useAction(api.plans.makePlan);
  const [state, setState] = useState<PlanState>({ status: "loading" });
  const run = useRef(0);

  // Resolves to the next state and never throws; callers apply it only if
  // no newer run has started.
  const load = useCallback(async (): Promise<PlanState> => {
    try {
      const plan = await makePlan({ spaceId, locale });
      analytics.capture("plan_made", {
        considered: plan.considered,
        place_count: plan.places.length,
      });
      return { status: "ready", ...plan };
    } catch (error) {
      const aiOff = isAiConsentRequired(error);
      analytics.capture("plan_failed", {
        reason: aiOff ? "ai_consent" : "error",
      });
      if (!aiOff) analytics.captureError("make_plan_failed", error);
      return { status: aiOff ? "ai_off" : "error" };
    }
  }, [makePlan, spaceId, locale]);

  // The initial state is already "loading", so mounting only waits.
  useEffect(() => {
    const current = ++run.current;
    void load().then((next) => {
      if (current === run.current) setState(next);
    });
    return () => {
      // Unmounted: drop whatever the in-flight run returns.
      run.current += 1;
    };
  }, [load]);

  const retry = useCallback(async () => {
    const current = ++run.current;
    setState({ status: "loading" });
    const next = await load();
    if (current === run.current) setState(next);
  }, [load]);

  return { state, retry };
}

/** `name` plus its area, for display and for the Maps query. */
export function placeLabel(place: PlanPlace): string {
  return place.area ? `${place.name}, ${place.area}` : place.name;
}

/** The plain-text plan the share sheet sends. */
export function planShareText(
  spaceName: string,
  places: PlanPlace[],
  picked: PlanPlace | null,
): string {
  const lines = [
    t("plan.shareIntro", { space: spaceName }),
    "",
    ...places.map((place, i) => `${i + 1}. ${placeLabel(place)}: ${place.why}`),
  ];
  if (picked) {
    lines.push("", t("plan.tonight", { name: picked.name }));
  }
  lines.push("", t("plan.shareFooter", { url: PLAN_SHARE_URL }));
  return lines.join("\n");
}

/**
 * The highlight path for "Pick for me": a few laps through the list that slow
 * down and stop on `winner`. Returns each step's index and how long it holds.
 */
export function spinSteps(
  count: number,
  winner: number,
  laps = 2,
): { index: number; holdMs: number }[] {
  if (count <= 0) return [];
  const total = count * laps + winner + 1;
  return Array.from({ length: total }, (_, step) => ({
    index: step % count,
    // Ease out: 60 ms per step at the start, about 300 ms at the end.
    holdMs: Math.round(60 + 240 * (step / Math.max(total - 1, 1)) ** 2),
  }));
}
