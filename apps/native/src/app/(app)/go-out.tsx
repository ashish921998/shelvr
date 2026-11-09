import { GoOutPicker } from "@/components/go-out-picker";
import { GoOutHub } from "@/components/go-out-hub";
import { goOutPlaces } from "@/lib/go-out";
import { useAppLocale } from "@/lib/i18n";
import { personalPlanAllowed } from "@/lib/list-gate";
import { usePlanGate } from "@/lib/plan-gate";
import { sameCity } from "@/lib/trip-planner";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { tidyCity } from "@convex/model/trip";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";

export default function GoOutScreen() {
  useAppLocale();
  const router = useRouter();
  const [picking, setPicking] = useState(false);
  const { city: cityParam, listId } = useLocalSearchParams<{
    city?: string;
    listId?: Id<"sharedLists">;
  }>();
  const city = tidyCity(cityParam ?? "");
  const { gated } = usePlanGate();
  const allowed = personalPlanAllowed(gated, listId);
  const personal = useQuery(
    convexQuery(api.mapPlaces.listMapPlaces, allowed && !listId ? {} : "skip"),
  );
  const shared = useQuery(
    convexQuery(
      api.sharedLists.getSharedList,
      allowed && listId ? { listId } : "skip",
    ),
  );
  const query = listId ? shared : personal;
  const places = useMemo(
    () =>
      goOutPlaces(
        (listId ? (shared.data?.places ?? []) : (personal.data ?? [])).filter(
          (place) => !city || sameCity(place.city ?? "", city),
        ),
      ),
    [listId, shared.data, personal.data, city],
  );
  if (!allowed) return <Redirect href="/plan-gate" />;
  const openPlan = (kind: "date" | "trip") =>
    router.replace({
      pathname: kind === "date" ? "/date-plan" : "/new-trip",
      params: { city, ...(listId ? { listId } : {}) },
    });
  if (!picking)
    return (
      <GoOutHub
        city={city}
        onClose={() => router.back()}
        onPlan={openPlan}
        onPickSpot={() => setPicking(true)}
      />
    );
  return (
    <GoOutPicker
      places={places}
      city={city}
      loading={query.isPending}
      failed={query.isError}
      onRetry={() => void query.refetch()}
      onClose={() => router.back()}
      onBack={() => setPicking(false)}
    />
  );
}
