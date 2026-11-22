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
  let held: MapLevel | undefined;
  const listeners = new Set<() => void>();
  const changed = () => {
    for (const listener of listeners) listener();
  };
  return {
    read: () => centre,
    zoom: () => zoom,
    held: () => held,
    hold: (next: MapLevel) => {
      held = next;
      changed();
    },
    move: (next: LatLng, nextZoom?: number, moved?: boolean) => {
      centre = next;
      zoom = nextZoom;
      if (moved) held = undefined;
      changed();
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
  const held = useSyncExternalStore(centre.subscribe, centre.held);
  const level = useMemo((): MapLevel => {
    if (held) return held;
    if (above === "city") return { kind: "city", city };
    if (above === "world") return { kind: "world" };
    return { kind: "country", country: above };
  }, [above, city, held]);
  useEffect(() => {
    setMapCityInView(city);
  }, [city]);
  return {
    city,
    level,
    cities,
    hold: centre.hold,
    onCentreChange: centre.move,
  };
}
