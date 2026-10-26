import { t } from "@/lib/i18n";
import { analytics } from "@/lib/analytics";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { placeKey, type PlanPlace } from "@convex/model/plan";
import { useAction, useMutation } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Share } from "react-native";

export type { PlanPlace };

type PlanState =
  | { status: "loading" }
  | {
      status: "ready";
      places: PlanPlace[];
      considered: number;
      planId: number;
    }
  | { status: "error" };

export const PLAN_SHARE_URL = "https://shelvr-web.vercel.app/?ct=plan-share";

const LOADING: PlanState = { status: "loading" };

type SharedShortlist = {
  expiresAt: number;
  places: PlanPlace[];
};

export function useMakePlan(
  spaceId: Id<"spaces">,
  locale: string,
  shared: SharedShortlist | null | undefined,
  city?: string,
) {
  const makePlan = useAction(api.plans.makePlan);
  const key = `${spaceId}:${locale}:${city ?? ""}`;
  const sharedRef = useRef(shared);
  useEffect(() => {
    sharedRef.current = shared;
  });
  const linkLoaded = shared !== undefined;
  const [result, setResult] = useState<{
    key: string;
    state: PlanState;
  } | null>(null);
  const run = useRef(0);

  const load = useCallback(
    async (planId: number): Promise<PlanState> => {
      try {
        const plan = await makePlan({ spaceId, locale, city });
        analytics.capture("plan_made", {
          considered: plan.considered,
          place_count: plan.places.length,
        });
        return { status: "ready", ...plan, planId };
      } catch (error) {
        analytics.capture("plan_failed", { reason: "error" });
        analytics.captureError("make_plan_failed", error);
        return { status: "error" };
      }
    },
    [makePlan, spaceId, locale, city],
  );

  useEffect(() => {
    if (!linkLoaded) return;
    const current = ++run.current;
    const link = sharedRef.current;
    const next: Promise<PlanState> =
      link && link.expiresAt > Date.now() && link.places.length > 0
        ? Promise.resolve({
            status: "ready",
            places: link.places,
            considered: link.places.length,
            planId: current,
          })
        : load(current);
    void next.then((state) => {
      if (current === run.current) setResult({ key, state });
    });
    return () => {
      run.current += 1;
    };
  }, [load, key, linkLoaded]);

  const resultRef = useRef(result);
  useEffect(() => {
    resultRef.current = result;
  });

  const retry = useCallback(async () => {
    const current = ++run.current;
    const shown =
      resultRef.current?.key === key ? resultRef.current.state : null;
    setResult(null);
    const next = await load(current);
    if (current !== run.current) return;
    if (next.status === "error" && shown?.status === "ready") {
      setResult({ key, state: shown });
      Alert.alert(t("plan.failedTitle"), t("errors.retrySoon"));
      return;
    }
    setResult({ key, state: next });
  }, [load, key]);

  const state = result?.key === key ? result.state : LOADING;
  return { state, retry };
}

export function usePlaceVisits() {
  const setVisited = useMutation(api.placeVisits.setVisited);
  const [marks, setMarks] = useState<ReadonlyMap<string, boolean>>(new Map());
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

type Deck = { planId: number | null; front: number; flipped: boolean };

export function usePlanDeck(planId: number | null, count: number) {
  const [deck, setDeck] = useState<Deck>({
    planId,
    front: 0,
    flipped: false,
  });
  const current =
    deck.planId === planId ? deck : { planId, front: 0, flipped: false };
  const front = count > 0 ? current.front % count : 0;

  const next = useCallback(() => {
    if (count === 0) return;
    setDeck({ planId, front: (front + 1) % count, flipped: false });
  }, [planId, front, count]);
  const show = useCallback(
    (index: number) => setDeck({ planId, front: index, flipped: false }),
    [planId],
  );
  const flip = useCallback(
    () => setDeck({ planId, front, flipped: !current.flipped }),
    [planId, front, current.flipped],
  );

  return { front, flipped: current.flipped, next, show, flip };
}

export function deckOrder(count: number, front: number, depth = 4): number[] {
  const shown = Math.min(count, depth);
  return Array.from(
    { length: shown },
    (_, i) => (front + shown - 1 - i) % count,
  );
}

type Pick = {
  planId: number;
  highlight: number | null;
  picked: number | null;
  spinning: boolean;
};

export function usePlanPicker(
  places: PlanPlace[],
  planId: number | null,
  options: {
    reducedMotion: boolean;
    onStep?: () => void;
    onPicked?: (index: number) => void;
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
      // A failed shuffle brings the same plan back; a spin cut short must not come back with it.
      setPick((shown) => (shown?.spinning ? null : shown));
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
        onPicked?.(winner);
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

const PLAN_MIN_SAVES = 3;

type PlanCandidate = {
  status: string;
  intents?: { kind: string }[];
  spaceIntents?: { kind: string }[];
};

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

export function placeLabel(place: PlanPlace): string {
  return place.area ? `${place.name}, ${place.area}` : place.name;
}

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

export function spinSteps(
  count: number,
  winner: number,
  laps = 2,
): { index: number; holdMs: number }[] {
  if (count <= 0) return [];
  const total = count * laps + winner + 1;
  return Array.from({ length: total }, (_, step) => ({
    index: step % count,
    holdMs: Math.round(60 + 240 * (step / Math.max(total - 1, 1)) ** 2),
  }));
}

export function planVoteUrl(token: string): string {
  const origin =
    process.env.EXPO_PUBLIC_WEB_URL || "https://shelvr-web.vercel.app";
  return new URL(`/p/${encodeURIComponent(token)}`, origin).href;
}

export function usePlanAsk(
  spaceId: Id<"spaces">,
  places: PlanPlace[],
  current: { token: string; expiresAt: number } | null,
) {
  const createPlanShare = useMutation(api.planShares.createPlanShare);
  const [asking, setAsking] = useState(false);
  const busy = useRef(false);

  const ask = useCallback(async () => {
    if (places.length === 0 || busy.current) return;
    busy.current = true;
    setAsking(true);
    try {
      const token =
        (current && current.expiresAt > Date.now() ? current.token : null) ??
        (await createPlanShare({
          spaceId,
          places: places.map((place) => ({
            name: place.name,
            area: place.area,
            why: place.why,
            itemId: place.itemId,
          })),
        }));
      await sharePlanLink(token, places.length);
    } catch (error) {
      analytics.capture("plan_ask_failed", { reason: "link" });
      analytics.captureError("plan_ask_failed", error);
      Alert.alert(t("plan.askFailedTitle"), t("errors.retrySoon"));
    } finally {
      busy.current = false;
      setAsking(false);
    }
  }, [createPlanShare, current, places, spaceId]);

  return { ask, asking };
}

async function sharePlanLink(token: string, placeCount: number) {
  try {
    const result = await Share.share({
      message: t("plan.askText", { url: planVoteUrl(token) }),
    });
    if (result.action === Share.sharedAction) {
      analytics.capture("plan_asked", { place_count: placeCount });
    }
  } catch (error) {
    analytics.capture("plan_ask_failed", { reason: "share" });
    analytics.captureError("plan_ask_failed", error);
    Alert.alert(t("plan.askFailedTitle"), t("errors.retrySoon"));
  }
}

export function linkForPlan<
  T extends { expiresAt: number; places: { name: string }[] },
>(link: T | null | undefined, places: PlanPlace[], now = Date.now()): T | null {
  if (!link || places.length === 0 || link.expiresAt <= now) return null;
  const keys = (names: { name: string }[]) =>
    names
      .map((entry) => placeKey(entry.name))
      .sort()
      .join("\n");
  return keys(link.places) === keys(places) ? link : null;
}

type PlanVotes = {
  voters: number;
  expiresAt: number;
  places: { name: string; picks: number; passes: number }[];
};

export function votesFor(
  votes: PlanVotes | null | undefined,
  place: PlanPlace,
): { picks: number; passes: number } | null {
  if (!votes) return null;
  const key = placeKey(place.name);
  const tally = votes.places.find((entry) => placeKey(entry.name) === key);
  if (!tally || tally.picks + tally.passes === 0) return null;
  return { picks: tally.picks, passes: tally.passes };
}

export function daysLeft(expiresAt: number, now = Date.now()): number {
  return Math.max(1, Math.ceil((expiresAt - now) / (24 * 60 * 60 * 1000)));
}
