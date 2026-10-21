import { t } from "@/lib/i18n";
import { analytics } from "@/lib/analytics";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { isAiConsentRequired } from "@convex/model/aiConsent";
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
      /** Unique per answer, so anything tied to one plan can key on it. */
      planId: number;
    }
  | { status: "ai_off" }
  | { status: "error" };

/** Where a shared plan sends people who don't have Shelvr yet. */
export const PLAN_SHARE_URL = "https://shelvr-web.vercel.app/?ct=plan-share";

const LOADING: PlanState = { status: "loading" };

/** The space's open vote link, as far as the plan screen needs it. */
type SharedShortlist = {
  expiresAt: number;
  places: PlanPlace[];
};

/**
 * Runs `plans.makePlan` for a space once per space and locale, and again on
 * `retry`. A late answer from an earlier run never overwrites a newer one, and
 * an answer for another space or locale reads as loading, never as ready.
 *
 * `shared` is the space's open vote link (undefined while it loads). When one
 * is open on arrival, the screen shows its shortlist instead of asking the
 * model again, so the owner comes back to the places people are voting on.
 * Only `retry` replaces it.
 */
export function useMakePlan(
  spaceId: Id<"spaces">,
  locale: string,
  shared: SharedShortlist | null | undefined,
) {
  const makePlan = useAction(api.plans.makePlan);
  const key = `${spaceId}:${locale}`;
  // Read once per arrival: a link made from this screen must not reset it.
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
      // Unmounted or regenerating: drop whatever the in-flight run returns.
      run.current += 1;
    };
  }, [load, key, linkLoaded]);

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

type Deck = { planId: number | null; front: number; flipped: boolean };

/**
 * The plan as a deck of cards: which card is on top and whether it is turned
 * over to show why it was picked. A new plan starts on its first card, face
 * up. `next` sends the top card to the back; `show` brings a card to the top.
 */
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

/**
 * Indexes of the cards to draw, back to front: up to `depth` cards, ending
 * with `front`, so the top card renders last.
 */
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

/** The vote page for a plan link (`apps/web/src/app/p/[token]`). */
export function planVoteUrl(token: string): string {
  return `https://shelvr-web.vercel.app/p/${token}`;
}

/**
 * "Ask someone": the share sheet with a vote link for the places on screen.
 * The open link is sent again while it holds this same shortlist, so votes
 * already in stay on the deck; a new shortlist gets a fresh link. One ask at
 * a time; a failed link or sheet says so, a cancelled sheet says nothing.
 */
export function usePlanAsk(
  spaceId: Id<"spaces">,
  places: PlanPlace[],
  current: { token: string; expiresAt: number } | null,
) {
  const createPlanShare = useMutation(api.planShares.createPlanShare);
  const [asking, setAsking] = useState(false);
  // A second tap can land before the `asking` render; this one cannot.
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

/** The share sheet for a made link. Its failure is reported, never thrown. */
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

/**
 * The open link, when it holds exactly the places on screen. A regenerated
 * plan is a new shortlist, so the old link's votes do not belong on it.
 */
export function linkForPlan<
  T extends { expiresAt: number; places: { name: string }[] },
>(link: T | null | undefined, places: PlanPlace[], now = Date.now()): T | null {
  // A cached query can outlive the link's week; a closed link has no votes to show.
  if (!link || places.length === 0 || link.expiresAt <= now) return null;
  const keys = (names: { name: string }[]) =>
    names
      .map((entry) => placeKey(entry.name))
      .sort()
      .join("\n");
  return keys(link.places) === keys(places) ? link : null;
}

/** The tallies an open vote link holds, by place. */
type PlanVotes = {
  voters: number;
  expiresAt: number;
  places: { name: string; picks: number; passes: number }[];
};

/** A place's tally on the link, or null when nobody voted on it. */
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

/** Whole days the link stays open, at least 1 while it is open. */
export function daysLeft(expiresAt: number, now = Date.now()): number {
  return Math.max(1, Math.ceil((expiresAt - now) / (24 * 60 * 60 * 1000)));
}
