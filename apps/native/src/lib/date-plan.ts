import { analytics } from "@/lib/analytics";
import { openPaywall } from "@/lib/entitlement";
import { t } from "@/lib/i18n";
import {
  placeMapsUrl,
  type StopAction,
  tripPlanFailure,
} from "@/lib/trip-planner";
import type { TextMessageKey } from "@/locales/message-types";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  type DateAsk,
  type DateEvening,
  type DateKind,
  type DatePlanResult,
  type DateSlot,
  type DateStop,
  swapStop,
} from "@convex/model/datePlan";
import { distanceKm } from "@convex/model/trip";
import { useAction } from "convex/react";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";

const PLACEMENT = "make_plan";
/** Streets wind: a walk is about this much longer than the straight line. */
const STREET_FACTOR = 1.3;
const WALK_KMH = 4.8;

export type DateOption = {
  ask: DateAsk;
  label: TextMessageKey;
  hint: TextMessageKey;
};

/** "What kind of date?", in the order the app asks it. */
export const DATE_OPTIONS: readonly DateOption[] = [
  {
    ask: "classic",
    label: "datePlan.classic",
    hint: "datePlan.classicHint",
  },
  { ask: "lowkey", label: "datePlan.lowkey", hint: "datePlan.lowkeyHint" },
  {
    ask: "surprise",
    label: "datePlan.surprise",
    hint: "datePlan.surpriseHint",
  },
];

const SLOT_LABELS: Record<DateKind, Record<DateSlot, TextMessageKey>> = {
  classic: { first: "datePlan.slotDinner", second: "datePlan.slotAfter" },
  lowkey: { first: "datePlan.slotCoffee", second: "datePlan.slotWalk" },
};

export function slotLabel(kind: DateKind, slot: DateSlot): string {
  return t(SLOT_LABELS[kind][slot]);
}

export function kindLabel(kind: DateKind): string {
  return t(kind === "classic" ? "datePlan.classic" : "datePlan.lowkey");
}

/** Walking minutes between two stops, rounded, never under one; the screen calls it approximate. */
export function walkMinutes(a: DateStop, b: DateStop): number {
  const km = distanceKm(a, b) * STREET_FACTOR;
  return Math.max(1, Math.round((km / WALK_KMH) * 60));
}

/** "Hours and info": Apple's place card when there is one, else the save, else Maps. */
export function infoAction(stop: DateStop, cardAvailable: boolean): StopAction {
  if (stop.appleId !== undefined && cardAvailable) {
    return { kind: "card", appleId: stop.appleId };
  }
  if (stop.source === "save" && stop.itemId !== undefined) {
    return { kind: "save", itemId: stop.itemId };
  }
  return { kind: "maps", url: placeMapsUrl(stop) };
}

/** "Directions to stop 1": directions in Maps to the evening's first stop, from wherever the person is. */
export function directionsUrl(
  stop: Pick<DateStop, "name" | "lat" | "lng">,
): string {
  const at = `${stop.lat},${stop.lng}`;
  if (Platform.OS === "ios") {
    return `https://maps.apple.com/?daddr=${at}&q=${encodeURIComponent(stop.name)}`;
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(at)}`;
}

/** The message "Send to your date" shares: the city, then each stop with a Maps link. */
export function dateShareText(
  city: string,
  first: DateStop,
  second: DateStop,
): string {
  return [
    t("datePlan.shareIntro", { city }),
    "",
    `1. ${first.name}`,
    placeMapsUrl(first),
    "",
    `2. ${second.name}`,
    placeMapsUrl(second),
  ].join("\n");
}

export function emptyMessage(
  result: DatePlanResult,
  onList: boolean,
): {
  title: string;
  message: string;
} {
  const { city } = result;
  if (result.status === "no_pair") {
    return {
      title: t("datePlan.noPairTitle"),
      message: onList
        ? t("sharedLists.noPairBody", { city })
        : t("datePlan.noPairBody", { city }),
    };
  }
  const classic = result.kind === "classic";
  const anchorKey = onList
    ? classic
      ? "sharedLists.noAnchorClassic"
      : "sharedLists.noAnchorLowkey"
    : classic
      ? "datePlan.noAnchorClassic"
      : "datePlan.noAnchorLowkey";
  return {
    title: t("datePlan.noAnchorTitle"),
    message: t(anchorKey, { city }),
  };
}

type DatePlanState =
  | { status: "picking"; problem: "rate_limited" | "error" | null }
  | { status: "planning"; ask: DateAsk }
  | { status: "empty"; result: DatePlanResult }
  | {
      status: "ready";
      result: DatePlanResult;
      /** The best evening, after any changes. */
      evening: DateEvening;
      /** Per slot, the stops already shown against the other slot's current stop. */
      tried: Record<DateSlot, number[]>;
    };

/** Plans a date for the city: asks the planner, then changes stops on the phone. */
export function useDatePlan(
  city: string,
  locale: string,
  listId?: Id<"sharedLists">,
) {
  const router = useRouter();
  const make = useAction(api.datePlans.makeDatePlan);
  const [state, setState] = useState<DatePlanState>({
    status: "picking",
    problem: null,
  });
  const busy = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const plan = useCallback(
    async (ask: DateAsk) => {
      if (busy.current) return;
      busy.current = true;
      setState({ status: "planning", ask });
      analytics.capture("date_plan_started", { kind: ask });
      let paywall = false;
      try {
        const result = await make({
          city,
          kind: ask,
          locale,
          ...(listId !== undefined ? { listId } : {}),
        });
        analytics.capture("date_plan_made", {
          kind: result.kind,
          asked: ask,
          status: result.status,
          evenings: result.evenings.length,
          suggested: result.stops.filter((s) => s.source === "suggested")
            .length,
        });
        if (!alive.current) return;
        setState(
          result.status === "ready"
            ? {
                status: "ready",
                result,
                evening: result.evenings[0],
                tried: { first: [], second: [] },
              }
            : { status: "empty", result },
        );
      } catch (error) {
        const reason = tripPlanFailure(error);
        analytics.capture("date_plan_failed", { reason });
        if (reason === "error")
          analytics.captureError("date_plan_failed", error);
        if (!alive.current) return;
        setState({
          status: "picking",
          problem: reason === "pro_required" ? null : reason,
        });
        paywall = reason === "pro_required";
      } finally {
        busy.current = false;
      }
      // Opened after `busy` is released: a tap before the sheet appears plans again and
      // joins (or, if iOS refused it, replaces) the same sheet instead of being dropped.
      if (paywall) await openPaywall(router, PLACEMENT);
    },
    [make, city, locale, listId, router],
  );

  /** Changes one stop; the screen offers it only when `canChange` says something fits. */
  const swap = useCallback(
    (slot: DateSlot) => {
      if (state.status !== "ready") return;
      const shown = [...state.tried[slot], state.evening[slot]];
      const evening = swapStop(state.result.stops, state.evening, slot, shown);
      analytics.capture("date_plan_swapped", {
        slot,
        swapped: evening !== null,
      });
      if (evening === null) return;
      // Back to one already shown: every stop has been tried, so the round starts over.
      const round = shown.includes(evening[slot]) ? [] : shown;
      // The other slot's stops were tried against the stop just replaced, so they reset.
      setState({
        ...state,
        evening,
        tried:
          slot === "first"
            ? { first: round, second: [] }
            : { first: [], second: round },
      });
    },
    [state],
  );

  const restart = useCallback(
    () => setState({ status: "picking", problem: null }),
    [],
  );

  return { state, plan, swap, restart };
}
