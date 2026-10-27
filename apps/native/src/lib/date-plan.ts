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
  ask: DateAsk | "new" | "big";
  label: TextMessageKey;
  hint: TextMessageKey;
  /** Shown, so people see where this is going, but not plannable yet. */
  soon?: boolean;
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
  {
    ask: "new",
    label: "datePlan.somethingNew",
    hint: "datePlan.somethingNewHint",
    soon: true,
  },
  {
    ask: "big",
    label: "datePlan.bigNight",
    hint: "datePlan.bigNightHint",
    soon: true,
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

/** "Let's go": directions in Maps to the evening's first stop, from wherever the person is. */
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

export function emptyMessage(result: DatePlanResult): {
  title: string;
  message: string;
} {
  if (result.status === "no_pair") {
    return {
      title: t("datePlan.noPairTitle"),
      message: t("datePlan.noPairBody", { city: result.city }),
    };
  }
  return {
    title: t("datePlan.noAnchorTitle"),
    message: t(
      result.kind === "classic"
        ? "datePlan.noAnchorClassic"
        : "datePlan.noAnchorLowkey",
      { city: result.city },
    ),
  };
}

type DatePlanState =
  | { status: "picking"; problem: "rate_limited" | "error" | null }
  | { status: "planning"; ask: DateAsk }
  | { status: "empty"; result: DatePlanResult }
  | {
      status: "ready";
      result: DatePlanResult;
      /** Which of the result's evenings "Try another evening" has reached. */
      index: number;
      /** That evening, after any swaps. */
      evening: DateEvening;
    };

/** The next evening after `index`, wrapping round to the first. */
export function nextEvening(
  result: DatePlanResult,
  index: number,
): { index: number; evening: DateEvening } {
  const next = (index + 1) % result.evenings.length;
  return { index: next, evening: result.evenings[next] };
}

/** Plans a date for the city: asks the planner, then deals evenings and swaps stops on the phone. */
export function useDatePlan(city: string, locale: string) {
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
      try {
        const result = await make({ city, kind: ask, locale });
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
                index: 0,
                evening: result.evenings[0],
              }
            : { status: "empty", result },
        );
      } catch (error) {
        const reason = tripPlanFailure(error);
        analytics.capture("date_plan_failed", { reason });
        if (reason === "error")
          analytics.captureError("date_plan_failed", error);
        if (!alive.current) return;
        if (reason === "pro_required") {
          setState({ status: "picking", problem: null });
          await openPaywall(router, PLACEMENT);
          return;
        }
        setState({ status: "picking", problem: reason });
      } finally {
        busy.current = false;
      }
    },
    [make, city, locale, router],
  );

  const another = useCallback(() => {
    setState((current) => {
      if (current.status !== "ready") return current;
      analytics.capture("date_plan_another", { index: current.index + 1 });
      return { ...current, ...nextEvening(current.result, current.index) };
    });
  }, []);

  /** Swaps one stop; false when nothing else nearby makes an evening with the other. */
  const swap = useCallback(
    (slot: DateSlot): boolean => {
      if (state.status !== "ready") return false;
      const evening = swapStop(state.result.stops, state.evening, slot);
      analytics.capture("date_plan_swapped", {
        slot,
        swapped: evening !== null,
      });
      if (evening === null) return false;
      setState({ ...state, evening });
      return true;
    },
    [state],
  );

  const restart = useCallback(
    () => setState({ status: "picking", problem: null }),
    [],
  );

  return { state, plan, another, swap, restart };
}
