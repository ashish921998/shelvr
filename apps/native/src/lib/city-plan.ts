import { analytics } from "@/lib/analytics";
import { usePaywallGuard } from "@/lib/entitlement";
import { t } from "@/lib/i18n";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Alert } from "react-native";

export type CityPlanKind = "date" | "trip";

/** Opens the date planner for the city's saves, or the trip planner with the city filled in. */
export function useCityPlan() {
  const router = useRouter();
  const planGuard = usePaywallGuard("make_plan").guard;
  const [busy, setBusy] = useState<CityPlanKind | null>(null);
  // A ref, not `busy`: a second tap can land before React re-renders with the first one's state.
  // The trip form stays open after `busy` clears, so its lock is released when this screen is back in focus.
  const locked = useRef(false);
  useFocusEffect(
    useCallback(() => {
      locked.current = false;
    }, []),
  );

  const start = async (kind: CityPlanKind, city: string) => {
    if (busy !== null || locked.current) return;
    locked.current = true;
    setBusy(kind);
    let formOpen = false;
    try {
      const allowed = await planGuard(() => undefined);
      if (!allowed) return;
      analytics.capture("city_plan_started", { kind });
      router.push({
        pathname: kind === "trip" ? "/new-trip" : "/date-plan",
        params: { city },
      });
      formOpen = kind === "trip";
    } catch (error) {
      analytics.captureError("city_plan_failed", error);
      Alert.alert(t("errors.tryAgain"));
    } finally {
      if (!formOpen) locked.current = false;
      setBusy(null);
    }
  };

  return { busy, start };
}
