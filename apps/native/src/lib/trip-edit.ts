import { analytics } from "@/lib/analytics";
import { t } from "@/lib/i18n";
import { tripDayLabel } from "@/lib/trip-planner";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { sameTripPlace } from "@convex/model/placeIdentity";
import {
  type TripPlace,
  type TripPlanDetail,
  type TripPlanStop,
  type TripSavePlace,
  UNPLANNED_DAY,
} from "@convex/model/tripPlan";
import type { OptimisticLocalStore } from "convex/browser";
import type { FunctionArgs } from "convex/server";
import { useAction, useMutation } from "convex/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert } from "react-native";

// Edit mode lays its rows out at fixed heights, so where a dragged stop lands is arithmetic.
export const EDIT_HEADER_HEIGHT = 56;
export const EDIT_ROW_HEIGHT = 64;

export type TripLayout = Pick<TripPlanDetail, "days" | "unplanned">;

/** One line of edit mode: a day's header (day 0 is Unplanned, listed last) or one of its stops. */
type EditEntry =
  | { kind: "header"; day: number }
  | { kind: "stop"; day: number; stop: TripPlanStop };

export function editEntries(trip: TripLayout): EditEntry[] {
  const groups = [
    ...trip.days.map((stops, i) => ({ day: i + 1, stops })),
    { day: UNPLANNED_DAY, stops: trip.unplanned },
  ];
  return groups.flatMap(({ day, stops }) => [
    { kind: "header" as const, day },
    ...stops.map((stop) => ({ kind: "stop" as const, day, stop })),
  ]);
}

/** Each entry's top, from the first header at 0, and the height of them all. */
export function entryTops(entries: { kind: EditEntry["kind"] }[]): {
  tops: number[];
  height: number;
} {
  const tops: number[] = [];
  let y = 0;
  for (const entry of entries) {
    tops.push(y);
    y += entry.kind === "header" ? EDIT_HEADER_HEIGHT : EDIT_ROW_HEIGHT;
  }
  return { tops, height: y };
}

export type StopPlace = { day: number; index: number };

/**
 * Where a dragged stop whose middle is at `centreY` would land, among the other entries (the
 * dragged one left out). `isStop[i]` and `days[i]` describe entry i. The stop goes into the slot
 * whose middle is nearest, and never above the first day's header.
 */
export function dropPlace(
  isStop: readonly boolean[],
  days: readonly number[],
  centreY: number,
): StopPlace {
  "worklet";
  let best = 1;
  let bestGap = Number.POSITIVE_INFINITY;
  let top = 0;
  for (let slot = 1; slot <= isStop.length; slot++) {
    top += isStop[slot - 1] ? EDIT_ROW_HEIGHT : EDIT_HEADER_HEIGHT;
    const gap = Math.abs(top + EDIT_ROW_HEIGHT / 2 - centreY);
    if (gap < bestGap) {
      bestGap = gap;
      best = slot;
    }
  }
  let index = 0;
  for (let i = best - 1; i >= 0 && isStop[i]; i--) index++;
  return { day: days[best - 1] ?? 1, index };
}

/** The trip with `stopId` moved to `index` of `day`; the trip as it was when the stop is not on it. */
export function moveInLayout(
  trip: TripLayout,
  stopId: Id<"tripStops">,
  to: StopPlace,
): TripLayout {
  const all = [...trip.days.flat(), ...trip.unplanned];
  const stop = all.find((candidate) => candidate._id === stopId);
  if (stop === undefined) return trip;
  const without = (stops: TripPlanStop[]) =>
    stops.filter((candidate) => candidate._id !== stopId);
  const days = trip.days.map(without);
  let unplanned = without(trip.unplanned);
  const into = (stops: TripPlanStop[]) => {
    const next = [...stops];
    next.splice(Math.min(Math.max(0, to.index), next.length), 0, stop);
    return next;
  };
  if (to.day === UNPLANNED_DAY) unplanned = into(unplanned);
  else if (days[to.day - 1] !== undefined) {
    days[to.day - 1] = into(days[to.day - 1]);
  } else return trip;
  return { days, unplanned };
}

/** Where a stop is now, or null when the trip doesn't hold it. */
export function placeOf(
  trip: TripLayout,
  stopId: Id<"tripStops">,
): StopPlace | null {
  for (const [i, stops] of trip.days.entries()) {
    const index = stops.findIndex((stop) => stop._id === stopId);
    if (index >= 0) return { day: i + 1, index };
  }
  const index = trip.unplanned.findIndex((stop) => stop._id === stopId);
  return index >= 0 ? { day: UNPLANNED_DAY, index } : null;
}

/** "Day 2", "Day 2 · Mon 3 Nov", or "Unplanned". */
export function editDayLabel(day: number, startDate: string | undefined) {
  return day === UNPLANNED_DAY
    ? t("tripPlanner.unplanned")
    : tripDayLabel(day - 1, startDate);
}

/** The places a stop can be sent to from its row's menu or VoiceOver actions, its own day left out. */
export function moveTargets(
  trip: Pick<TripPlanDetail, "dayCount" | "startDate">,
  from: number,
): { day: number; label: string }[] {
  return [
    ...Array.from({ length: trip.dayCount }, (_, i) => i + 1),
    UNPLANNED_DAY,
  ]
    .filter((day) => day !== from)
    .map((day) => ({
      day,
      label:
        day === UNPLANNED_DAY
          ? t("tripPlanner.moveToUnplanned")
          : t("tripPlanner.moveToDay", {
              day: editDayLabel(day, trip.startDate),
            }),
    }));
}

/** The last edit Undo can take back: where the stop was before it. */
export type TripUndo = {
  kind: "move" | "remove";
  stopId: Id<"tripStops">;
  message: string;
  before: StopPlace;
};

/** How long the Undo bar stays after an edit. */
const UNDO_MS = 10_000;

function showEditFailed(error: unknown) {
  analytics.captureError("trip_plan_edit_failed", error);
  Alert.alert(t("tripPlanner.editFailed"));
}

/**
 * Edits to one trip, each shown at once through an optimistic update of `getTripPlan`, with
 * the last move or remove kept for Undo.
 */
export function useTripEditor(trip: TripPlanDetail) {
  const tripId = trip._id;
  const move = useMutation(api.tripPlannerData.moveTripStop);
  const remove = useMutation(api.tripPlannerData.removeTripStop);
  const optimistic = useMemo(() => {
    // Every edit here is a stop landing somewhere; the optimistic trip is the move made locally.
    const land =
      (to: (args: Partial<StopPlace>) => StopPlace) =>
      (
        store: OptimisticLocalStore,
        args: { stopId: Id<"tripStops"> } & Partial<StopPlace>,
      ) => {
        const query = api.tripPlannerData.getTripPlan;
        const current = store.getQuery(query, { tripId });
        if (!current) return;
        store.setQuery(
          query,
          { tripId },
          { ...current, ...moveInLayout(current, args.stopId, to(args)) },
        );
      };
    const asked = (args: Partial<StopPlace>) => ({
      day: args.day ?? UNPLANNED_DAY,
      index: args.index ?? 0,
    });
    return {
      move: move.withOptimisticUpdate(land(asked)),
      remove: remove.withOptimisticUpdate(
        land(() => ({ day: UNPLANNED_DAY, index: 0 })),
      ),
    };
  }, [move, remove, tripId]);

  const [undo, setUndo] = useState<TripUndo | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Undo belongs to the latest edit only; one that answers after a newer edit began offers none.
  const latest = useRef(0);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const offerUndo = useCallback((next: TripUndo | null) => {
    if (timer.current) clearTimeout(timer.current);
    setUndo(next);
    if (next) timer.current = setTimeout(() => setUndo(null), UNDO_MS);
  }, []);

  const stopName = useCallback(
    (stopId: Id<"tripStops">) =>
      [...trip.days.flat(), ...trip.unplanned].find(
        (stop) => stop._id === stopId,
      )?.name ?? "",
    [trip],
  );

  const moveStop = useCallback(
    async (stopId: Id<"tripStops">, to: StopPlace, method: "drag" | "menu") => {
      const from = placeOf(trip, stopId);
      if (from === null || (from.day === to.day && from.index === to.index)) {
        return;
      }
      const name = stopName(stopId);
      const edit = ++latest.current;
      offerUndo(null);
      try {
        const before = await optimistic.move({ stopId, ...to });
        analytics.capture("trip_plan_stop_moved", {
          across_days: from.day !== to.day,
          method,
        });
        if (edit !== latest.current) return;
        offerUndo({
          kind: "move",
          stopId,
          before,
          message:
            from.day === to.day
              ? t("tripPlanner.moved", { name })
              : t("tripPlanner.movedTo", {
                  name,
                  day: editDayLabel(to.day, trip.startDate),
                }),
        });
      } catch (error) {
        showEditFailed(error);
      }
    },
    [offerUndo, optimistic, stopName, trip],
  );

  const removeStop = useCallback(
    async (stop: TripPlanStop) => {
      const edit = ++latest.current;
      offerUndo(null);
      try {
        const before = await optimistic.remove({ stopId: stop._id });
        analytics.capture("trip_plan_stop_removed", { source: stop.source });
        if (edit !== latest.current) return;
        offerUndo({
          kind: "remove",
          stopId: stop._id,
          before,
          message: t("tripPlanner.removed", { name: stop.name }),
        });
      } catch (error) {
        showEditFailed(error);
      }
    },
    [offerUndo, optimistic],
  );

  const undoLast = useCallback(async () => {
    if (undo === null) return;
    latest.current++;
    offerUndo(null);
    try {
      await optimistic.move({ stopId: undo.stopId, ...undo.before });
      analytics.capture("trip_plan_edit_undone", { action: undo.kind });
    } catch (error) {
      showEditFailed(error);
    }
  }, [offerUndo, optimistic, undo]);

  return {
    moveStop,
    removeStop,
    undo,
    undoLast,
    dismissUndo: () => offerUndo(null),
  };
}

/** Renames the trip; an unchanged name sends nothing, and an empty one goes back to "<city> trip". */
export function useRenameTrip(
  tripId: Id<"tripPlans">,
  current: string | undefined,
) {
  const rename = useMutation(api.tripPlannerData.renameTripPlan);
  // Ending the edit and submitting both send the name. Each one is compared with the newest
  // name still on its way, else the saved one; only that newest send clears the record.
  const pending = useRef<{ name: string } | null>(null);
  return useCallback(
    async (text: string) => {
      const name = text.replace(/\s+/g, " ").trim();
      if (name === (pending.current?.name ?? current ?? "")) return;
      const sent = { name };
      pending.current = sent;
      try {
        await rename({ tripId, name });
        analytics.capture("trip_plan_renamed", { cleared: name === "" });
      } catch (error) {
        showEditFailed(error);
      } finally {
        if (pending.current === sent) pending.current = null;
      }
    },
    [current, rename, tripId],
  );
}

/** Typing pauses this long before Add a place asks Apple. */
const SEARCH_DEBOUNCE_MS = 450;
const MIN_SEARCH_LENGTH = 2;

export type PlaceSearch =
  | { status: "idle" }
  | { status: "searching" }
  | { status: "done"; places: TripPlace[] }
  | { status: "unavailable" }
  | { status: "failed" };

/** Add a place's Apple search, run once typing pauses; a later answer always replaces an earlier one. */
export function useTripPlaceSearch(
  tripId: Id<"tripPlans">,
  query: string,
  locale: string,
): PlaceSearch {
  const search = useAction(api.tripPlanner.searchTripPlaces);
  // The answer and the text it answers; any other text is still being searched.
  const [answer, setAnswer] = useState<{
    text: string;
    result: PlaceSearch;
  } | null>(null);
  const latest = useRef(0);
  const text = query.trim();
  const short = text.length < MIN_SEARCH_LENGTH;
  useEffect(() => {
    const ask = ++latest.current;
    if (short) return;
    const timer = setTimeout(() => {
      search({ tripId, query: text, locale })
        .then((result) => {
          if (ask !== latest.current) return;
          analytics.capture("trip_plan_place_searched", {
            results: result.places.length,
            available: result.available,
          });
          setAnswer({
            text,
            result: result.available
              ? { status: "done", places: result.places }
              : { status: "unavailable" },
          });
        })
        .catch((error: unknown) => {
          if (ask !== latest.current) return;
          analytics.captureError("trip_plan_search_failed", error);
          setAnswer({ text, result: { status: "failed" } });
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [locale, search, short, text, tripId]);
  if (short) return { status: "idle" };
  return answer?.text === text ? answer.result : { status: "searching" };
}

/** Saved places whose name or save title holds every word typed; all of them before anything is. */
export function matchSavePlaces(
  places: TripSavePlace[],
  query: string,
): TripSavePlace[] {
  const words = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return places;
  return places.filter((place) => {
    const text = `${place.name} ${place.title ?? ""}`.toLocaleLowerCase();
    return words.every((word) => text.includes(word));
  });
}

/** Whether a search result is already one of the trip's stops, by the rule adding it uses. */
export function onTrip(trip: TripLayout, place: TripPlace): boolean {
  return [...trip.days.flat(), ...trip.unplanned].some((stop) =>
    sameTripPlace(stop, place),
  );
}

export type NewTripStop = FunctionArgs<
  typeof api.tripPlannerData.addTripStop
>["place"];

/** Adds a place to a day of the trip; resolves true once it is on. */
export function useAddTripStop(tripId: Id<"tripPlans">) {
  const add = useMutation(api.tripPlannerData.addTripStop);
  return useCallback(
    async (day: number, place: NewTripStop): Promise<boolean> => {
      try {
        await add({ tripId, day, place });
        analytics.capture("trip_plan_stop_added", {
          from: place.kind,
          unplanned: day === UNPLANNED_DAY,
        });
        return true;
      } catch (error) {
        analytics.captureError("trip_plan_add_failed", error);
        Alert.alert(t("tripPlanner.addFailed"));
        return false;
      }
    },
    [add, tripId],
  );
}
