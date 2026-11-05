import { type LatLng } from "@convex/model/trip";
import { useState, useSyncExternalStore } from "react";
import { busiestCityPlaces, cityNear } from "./map-filters";

type Located = LatLng & { city?: string };

function mapCentre() {
  let centre: LatLng | undefined;
  const listeners = new Set<() => void>();
  return {
    read: () => centre,
    move: (next: LatLng) => {
      centre = next;
      for (const listener of listeners) listener();
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export function useMapCity(all: readonly Located[]) {
  const [centre] = useState(mapCentre);
  const city = useSyncExternalStore(centre.subscribe, () => {
    const inView = centre.read();
    return inView
      ? cityNear(all, inView)
      : busiestCityPlaces(all).find((place) => place.city)?.city;
  });
  return { city, onCentreChange: centre.move };
}
