import { type LatLng } from "@convex/model/trip";
import { useCallback, useState } from "react";
import { busiestCityPlaces, cityNear } from "./map-filters";

type Located = LatLng & { city?: string };

export function useMapCity(all: readonly Located[]) {
  const [inView, setInView] = useState<{ city?: string }>();
  const onCentreChange = useCallback(
    (centre: LatLng) => {
      const city = cityNear(all, centre);
      setInView((shown) => (shown && shown.city === city ? shown : { city }));
    },
    [all],
  );
  const busiest = busiestCityPlaces(all).find((place) => place.city)?.city;
  return { city: inView ? inView.city : busiest, onCentreChange };
}
