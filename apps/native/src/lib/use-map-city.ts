import { type LatLng } from "@convex/model/trip";
import { useState, useSyncExternalStore } from "react";
import { cityFillingMap } from "./map-city-zoom";
import { busiestCityPlaces, cityNear } from "./map-filters";

type Located = LatLng & { city?: string };

function mapCentre() {
  let centre: LatLng | undefined;
  let zoom: number | undefined;
  const listeners = new Set<() => void>();
  return {
    read: () => centre,
    zoom: () => zoom,
    move: (next: LatLng, nextZoom?: number) => {
      centre = next;
      zoom = nextZoom;
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
      ? cityFillingMap(cityNear(all, inView), centre.zoom())
      : busiestCityPlaces(all).find((place) => place.city)?.city;
  });
  return { city, onCentreChange: centre.move };
}
