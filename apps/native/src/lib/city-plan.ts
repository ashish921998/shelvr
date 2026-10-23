import { analytics } from "@/lib/analytics";
import { usePaywallGuard } from "@/lib/entitlement";
import { t } from "@/lib/i18n";
import { api } from "@convex/_generated/api";
import { useMutation } from "convex/react";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert } from "react-native";

export type CityPlanKind = "date" | "trip";

/** Files a city's saves into its space, then opens the date plan or trip for it. */
export function useCityPlan(city: string) {
  const router = useRouter();
  const ensureCitySpace = useMutation(api.spaces.ensureCitySpace);
  const dateGuard = usePaywallGuard("make_plan").guard;
  const tripGuard = usePaywallGuard("plan_trip").guard;
  const [busy, setBusy] = useState<CityPlanKind | null>(null);

  const start = async (kind: CityPlanKind) => {
    if (busy !== null) return;
    const guard = kind === "date" ? dateGuard : tripGuard;
    setBusy(kind);
    try {
      const allowed = await guard(() => undefined);
      if (!allowed) return;
      analytics.capture("city_plan_started", { kind });
      const spaceId = await ensureCitySpace({ city });
      router.push({
        pathname: kind === "date" ? "/plan/[id]" : "/trip/[id]",
        params: { id: spaceId },
      });
    } catch (error) {
      analytics.captureError("city_plan_failed", error);
      Alert.alert(t("errors.tryAgain"));
    } finally {
      setBusy(null);
    }
  };

  return { busy, start };
}
