import { analytics } from "@/lib/analytics";
import { openPaywall, usePaywallGuard } from "@/lib/entitlement";
import {
  type CityChoice,
  sameCity,
  type TripForm,
  tripFormArgs,
  tripPlanFailure,
  type TripPlanProblem,
} from "@/lib/trip-planner";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useAction } from "convex/react";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";

const PLACEMENT = "plan_trip";

type CreateTripState =
  | { status: "idle"; problem: TripPlanProblem | null }
  | { status: "planning"; city: string }
  | { status: "ready"; city: string; tripId: Id<"tripPlans"> };

/** Plans a trip from the form: checks it, gates it on Pro, runs the planner and keeps where that got to. */
export function useCreateTripPlan(locale: string, cities: CityChoice[]) {
  const router = useRouter();
  const create = useAction(api.tripPlanner.createTripPlan);
  const { guard, loading } = usePaywallGuard(PLACEMENT);
  const [state, setState] = useState<CreateTripState>({
    status: "idle",
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

  const run = useCallback(
    async (form: TripForm) => {
      const parsed = tripFormArgs(form, locale);
      if (!parsed.ok) {
        setState({ status: "idle", problem: { kind: parsed.problem } });
        return;
      }
      if (!(await guard()) || !alive.current) return;
      const { args } = parsed;
      const shared = { days: args.days, pace: args.pace };
      analytics.capture("trip_plan_started", {
        ...shared,
        interest_count: args.interests.length,
        dated: args.startDate !== undefined,
        has_stay: args.stay !== undefined,
        saved_city: cities.some((choice) => sameCity(choice.city, args.city)),
      });
      setState({ status: "planning", city: args.city });
      try {
        const result = await create(args);
        analytics.capture("trip_plan_made", {
          ...shared,
          saves: result.saves,
          suggested: result.suggested,
          made: result.tripId !== null,
        });
        if (!alive.current) return;
        setState(
          result.tripId === null
            ? { status: "idle", problem: { kind: "empty", city: args.city } }
            : { status: "ready", city: args.city, tripId: result.tripId },
        );
      } catch (error) {
        const reason = tripPlanFailure(error);
        analytics.capture("trip_plan_failed", { reason });
        if (reason === "error") {
          analytics.captureError("create_trip_plan_failed", error);
        }
        if (!alive.current) return;
        if (reason === "pro_required") {
          setState({ status: "idle", problem: null });
          await openPaywall(router, PLACEMENT);
          return;
        }
        setState({ status: "idle", problem: { kind: reason } });
      }
    },
    [locale, guard, cities, create, router],
  );

  const submit = useCallback(
    async (form: TripForm) => {
      if (busy.current || loading) return;
      busy.current = true;
      try {
        await run(form);
      } finally {
        busy.current = false;
      }
    },
    [run, loading],
  );

  /** The reveal has finished: the new trip takes this screen's place. */
  const open = useCallback(() => {
    if (state.status !== "ready" || !alive.current) return;
    router.replace({
      pathname: "/trip-plan/[id]",
      params: { id: state.tripId },
    });
  }, [state, router]);

  return { state, submit, open, loading };
}
