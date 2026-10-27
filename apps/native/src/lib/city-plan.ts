import { analytics } from "@/lib/analytics";
import { usePaywallGuard } from "@/lib/entitlement";
import { t } from "@/lib/i18n";
import { api } from "@convex/_generated/api";
import { useMutation } from "convex/react";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert } from "react-native";

export type CityPlanKind = "date" | "trip";

/** Opens a date plan for the city's saves, or the trip planner with the city filled in. */
export function useCityPlan(city: string) {
  const router = useRouter();
  const ensureCitySpace = useMutation(api.spaces.ensureCitySpace);
  const dateGuard = usePaywallGuard("make_plan").guard;
  const [busy, setBusy] = useState<CityPlanKind | null>(null);

  const start = async (kind: CityPlanKind) => {
    if (busy !== null) return;
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
      const spaceId = await ensureCitySpace({ city });
      router.push({ pathname: "/plan/[id]", params: { id: spaceId, city } });
    } catch (error) {
      analytics.captureError("city_plan_failed", error);
      Alert.alert(t("errors.tryAgain"));
    } finally {
      setBusy(null);
    }
  };

  return { busy, start };
}
