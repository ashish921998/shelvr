import { analytics } from "@/lib/analytics";
import { usePaywallGuard } from "@/lib/entitlement";
import { t } from "@/lib/i18n";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Alert } from "react-native";

export type CityPlanKind = "date" | "trip";

/** Opens the date planner for the city's saves, or the trip planner with the city filled in. */
export function useCityPlan(city: string) {
  const router = useRouter();
  const dateGuard = usePaywallGuard("make_plan").guard;
  const [busy, setBusy] = useState<CityPlanKind | null>(null);
  // A ref, not `busy`: a second tap can land before React re-renders with the first one's state.
  // The trip form opens without `busy`, so its lock is released when this screen is back in focus.
  const locked = useRef(false);
  useFocusEffect(
    useCallback(() => {
      locked.current = false;
    }, []),
  );

  const start = async (kind: CityPlanKind) => {
    if (busy !== null || locked.current) return;
    locked.current = true;
    if (kind === "trip") {
      // The planner asks for Pro when it plans, so the form opens straight away.
      analytics.capture("city_plan_started", { kind });
      router.push({ pathname: "/new-trip", params: { city } });
      return;
    }
    setBusy(kind);
    try {
      const allowed = await dateGuard(() => undefined);
      if (!allowed) return;
      analytics.capture("city_plan_started", { kind });
      router.push({ pathname: "/date-plan", params: { city } });
    } catch (error) {
      analytics.captureError("city_plan_failed", error);
      Alert.alert(t("errors.tryAgain"));
    } finally {
      locked.current = false;
      setBusy(null);
    }
  };

  return { busy, start };
}
