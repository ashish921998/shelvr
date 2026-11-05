import { type LatLng } from "@convex/model/trip";
import { useCallback, useState } from "react";
import { busiestCityPlaces, cityNear } from "./map-filters";

type Located = LatLng & { city?: string };

export function useMapCity(all: readonly Located[]) {
  const [city, setCity] = useState<string | undefined>(undefined);
  const onCentreChange = useCallback(
    (centre: LatLng) => setCity(cityNear(all, centre)),
    [all],
  );
  const busiest = busiestCityPlaces(all).find((place) => place.city)?.city;
  return { city: city ?? busiest, onCentreChange };
}
