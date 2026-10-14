import { t } from "@/lib/i18n";
import { analytics } from "@/lib/analytics";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { isAiConsentRequired } from "@convex/model/aiConsent";
import { placeKey, type PlanPlace } from "@convex/model/plan";
import { useAction, useMutation } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";

export type { PlanPlace };

type PlanState =
  | { status: "loading" }
  | {
      status: "ready";
      places: PlanPlace[];
      considered: number;
      /** Unique per answer, so anything tied to one plan can key on it. */
      planId: number;
    }
  | { status: "ai_off" }
  | { status: "error" };

/** Where a shared plan sends people who don't have Shelvr yet. */
export const PLAN_SHARE_URL = "https://shelvr-web.vercel.app/?ct=plan-share";

const LOADING: PlanState = { status: "loading" };

/**
 * Runs `plans.makePlan` for a space once per space and locale, and again on
 * `retry`. A late answer from an earlier run never overwrites a newer one, and
 * an answer for another space or locale reads as loading, never as ready.
 */
export function useMakePlan(spaceId: Id<"spaces">, locale: string) {
  const makePlan = useAction(api.plans.makePlan);
  const key = `${spaceId}:${locale}`;
  const [result, setResult] = useState<{
    key: string;
    state: PlanState;
  } | null>(null);
  const run = useRef(0);

  // Resolves to the next state and never throws; callers apply it only if
  // no newer run has started.
  const load = useCallback(
    async (planId: number): Promise<PlanState> => {
      try {
        const plan = await makePlan({ spaceId, locale });
        analytics.capture("plan_made", {
          considered: plan.considered,
          place_count: plan.places.length,
        });
        return { status: "ready", ...plan, planId };
      } catch (error) {
        const aiOff = isAiConsentRequired(error);
        analytics.capture("plan_failed", {
          reason: aiOff ? "ai_consent" : "error",
        });
        if (!aiOff) analytics.captureError("make_plan_failed", error);
        return { status: aiOff ? "ai_off" : "error" };
      }
    },
    [makePlan, spaceId, locale],
  );

  useEffect(() => {
    const current = ++run.current;
    void load(current).then((next) => {
      if (current === run.current) setResult({ key, state: next });
    });
    return () => {
      // Unmounted or regenerating: drop whatever the in-flight run returns.
      run.current += 1;
    };
  }, [load, key]);

  const retry = useCallback(async () => {
    const current = ++run.current;
    setResult(null);
    const next = await load(current);
    if (current === run.current) setResult({ key, state: next });
  }, [load, key]);

  const state = result?.key === key ? result.state : LOADING;
  return { state, retry };
}

/**
 * "We went" for the places on a plan. A tap shows at once and is saved in the
 * background; if the save fails the place goes back to how it was. A place
 * the server already tagged `been` reads as visited until the user takes the
 * mark back.
 */
export function usePlaceVisits() {
  const setVisited = useMutation(api.placeVisits.setVisited);
  const [marks, setMarks] = useState<ReadonlyMap<string, boolean>>(new Map());
  // The latest tap per place: an older save failing must not undo a newer tap.
  const latest = useRef(new Map<string, number>());

  const isVisited = useCallback(
    (place: PlanPlace) =>
      marks.get(placeKey(place.name)) ?? place.been === true,
    [marks],
  );

  const toggle = useCallback(
    (place: PlanPlace) => {
      const key = placeKey(place.name);
      const was = marks.get(key) ?? place.been === true;
      const tap = (latest.current.get(key) ?? 0) + 1;
      latest.current.set(key, tap);
      const mark = (value: boolean) =>
        setMarks((current) => new Map(current).set(key, value));
      mark(!was);
      analytics.capture("plan_place_visited", { visited: !was });
      setVisited({
        itemId: place.itemId,
        name: place.name,
        visited: !was,
      }).catch((error: unknown) => {
        if (latest.current.get(key) === tap) mark(was);
        analytics.captureError("plan_visit_failed", error);
      });
    },
    [marks, setVisited],
  );

  return { isVisited, toggle };
}

type Pick = {
  planId: number;
  highlight: number | null;
  picked: number | null;
  spinning: boolean;
};

/**
 * "Pick for me" for one plan: the spin, its timers and the result all belong
 * to `planId`. A new plan (or none, while one loads) discards the last pick
 * and stops a spin still running; so does unmounting.
 */
export function usePlanPicker(
  places: PlanPlace[],
  planId: number | null,
  options: {
    reducedMotion: boolean;
    onStep?: () => void;
    onPicked?: () => void;
  },
) {
  const [pick, setPick] = useState<Pick | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const spinningPlan = useRef<number | null>(null);

  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
      spinningPlan.current = null;
    },
    [planId],
  );

  const current = pick !== null && pick.planId === planId ? pick : null;
  const { reducedMotion, onStep, onPicked } = options;

  const pickForMe = useCallback(() => {
    if (planId === null || places.length === 0) return;
    if (spinningPlan.current === planId) return;
    spinningPlan.current = planId;
    timers.current = [];
    setPick({ planId, highlight: null, picked: null, spinning: true });
    const winner = Math.floor(Math.random() * places.length);
    // Reduce Motion lands straight on the pick instead of cycling cards.
    const steps = reducedMotion ? [] : spinSteps(places.length, winner);
    let at = 0;
    for (const step of steps) {
      timers.current.push(
        setTimeout(() => {
          setPick({
            planId,
            highlight: step.index,
            picked: null,
            spinning: true,
          });
          onStep?.();
        }, at),
      );
      at += step.holdMs;
    }
    timers.current.push(
      setTimeout(() => {
        spinningPlan.current = null;
        setPick({ planId, highlight: winner, picked: winner, spinning: false });
        onPicked?.();
      }, at),
    );
  }, [planId, places.length, reducedMotion, onStep, onPicked]);

  const picked = current?.picked ?? null;
  return {
    highlight: current?.highlight ?? null,
    picked,
    pickedPlace: picked === null ? null : (places[picked] ?? null),
    isSpinning: current?.spinning ?? false,
    pickForMe,
  };
}

/** Ready saves a space needs before it offers a plan. */
const PLAN_MIN_SAVES = 3;

type PlanCandidate = {
  status: string;
  intents?: { kind: string }[];
  spaceIntents?: { kind: string }[];
};

/**
 * Whether a space offers "Make a plan". The planner reads ready saves only,
 * and at least one must already carry a place (an "Open in Maps" action, on
 * the save or steered for this space), so a reading list never offers one.
 */
export function canMakePlan(items: PlanCandidate[]): boolean {
  const ready = items.filter((item) => item.status === "ready");
  return (
    ready.length >= PLAN_MIN_SAVES &&
    ready.some((item) =>
      [...(item.intents ?? []), ...(item.spaceIntents ?? [])].some(
        (intent) => intent.kind === "open_maps",
      ),
    )
  );
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
