import { t } from "@/lib/i18n";
import {
  SAMPLE_CITIES,
  isSampleCity,
  type SampleCityId,
} from "@/lib/sample-cities";
import { api } from "@convex/_generated/api";
import { cityStampName, isCityStampId } from "@convex/model/cityStamps";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useConvexAuth } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useMemo } from "react";

export type CityStamp = FunctionReturnType<
  typeof api.cityStamps.listCityStamps
>[number];

export function useCityStamps(enabled = true): {
  stamps: CityStamp[] | undefined;
  error: Error | null;
} {
  const { isAuthenticated } = useConvexAuth();
  const { data, error } = useQuery(
    convexQuery(
      api.cityStamps.listCityStamps,
      isAuthenticated && enabled ? {} : "skip",
    ),
  );
  const stamps = useMemo(
    () => data?.filter((stamp) => isSampleCity(stamp.city)),
    [data],
  );
  return { stamps, error };
}

export function cityStampLabel(city: string): string {
  if (isSampleCity(city)) return t(SAMPLE_CITIES[city].name);
  return isCityStampId(city) ? cityStampName(city) : city;
}

export function stampedCityIds(
  stamps: readonly CityStamp[] | undefined,
): SampleCityId[] {
  return (stamps ?? []).flatMap((stamp) =>
    isSampleCity(stamp.city) ? [stamp.city] : [],
  );
}
