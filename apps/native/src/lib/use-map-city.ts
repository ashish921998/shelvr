import { type LatLng } from "@convex/model/trip";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { mapCities } from "./map-cities";
import { setMapCityInView } from "./map-city-in-view";
import { cityFillingMap, type MapLevel, mapLevel } from "./map-city-zoom";
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
  const cities = useMemo(() => mapCities(all), [all]);
  const city = useSyncExternalStore(centre.subscribe, () => {
    const inView = centre.read();
    return inView
      ? cityFillingMap(cityNear(all, inView), centre.zoom())
      : busiestCityPlaces(all).find((place) => place.city)?.city;
  });
  const above = useSyncExternalStore(centre.subscribe, () => {
    const level = mapLevel(undefined, centre.read(), centre.zoom(), cities);
    return level.kind === "country" ? level.country : level.kind;
  });
  const level = useMemo((): MapLevel => {
    if (above === "city") return { kind: "city", city };
    if (above === "world") return { kind: "world" };
    return { kind: "country", country: above };
  }, [above, city]);
  useEffect(() => {
    setMapCityInView(city);
  }, [city]);
  return { city, level, cities, onCentreChange: centre.move };
}
