import { PlanCitySheet } from "@/components/home/plan-city-sheet";
import { canBrowse } from "@/lib/access";
import { type CityPlanKind, useCityPlan } from "@/lib/city-plan";
import { useAccess } from "@/lib/free-plan";
import { type City, plannableCities } from "@/lib/home-places";
import { t } from "@/lib/i18n";
import { sameCity } from "@/lib/trip-planner";
import { api } from "@convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Alert } from "react-native";

export function planTarget(
  cities: City[],
  inView: string | undefined,
): { city: string } | "pick" | "none" {
  const shown =
    inView === undefined
      ? undefined
      : cities.find((entry) => sameCity(entry.city, inView));
  if (shown) return { city: shown.city };
  const [only] = cities;
  if (only && cities.length === 1) return { city: only.city };
  return cities.length > 1 ? "pick" : "none";
}

export function usePlanPicker({ onLeave }: { onLeave?: () => void } = {}) {
  const browsing = canBrowse(useAccess());
  const listed = useQuery(
    convexQuery(api.items.listCities, browsing ? {} : "skip"),
  );
  const cities = browsing && listed.data ? plannableCities(listed.data) : [];
  const { busy, start } = useCityPlan();
  const [picking, setPicking] = useState<{ kind: CityPlanKind; open: boolean }>(
    { kind: "date", open: false },
  );
  const go = (kind: CityPlanKind, city: string) => {
    void start(kind, city, onLeave);
  };
  const plan = (kind: CityPlanKind, inView?: string) => {
    if (busy !== null || listed.data === undefined) return;
    const target = planTarget(cities, inView);
    if (target === "pick") setPicking({ kind, open: true });
    else if (target === "none")
      Alert.alert(t("plan.emptyTitle"), t("homePlaces.planNeedsPlaces"));
    else go(kind, target.city);
  };
  const sheet = (
    <PlanCitySheet
      visible={picking.open}
      kind={picking.kind}
      cities={cities}
      onClose={() => setPicking((previous) => ({ ...previous, open: false }))}
      onPick={(city) => go(picking.kind, city)}
    />
  );
  return { plan, sheet };
}
