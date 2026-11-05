import { type LatLng } from "@convex/model/trip";
import { useCallback, useState } from "react";
import { busiestCityPlaces, cityNear } from "./map-filters";

type Located = LatLng & { city?: string };

export function useMapCity(all: readonly Located[]) {
  const [inView, setInView] = useState<LatLng>();
  const onCentreChange = useCallback(
    (centre: LatLng) =>
      setInView((shown) =>
        shown && cityNear(all, shown) === cityNear(all, centre)
          ? shown
          : centre,
      ),
    [all],
  );
  const busiest = busiestCityPlaces(all).find((place) => place.city)?.city;
  return { city: inView ? cityNear(all, inView) : busiest, onCentreChange };
}
