import { type LatLng } from "@convex/model/trip";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { mapCities } from "./map-cities";
import { setMapCityInView } from "./map-city-in-view";
import {
  holdLevel,
  type MapLevel,
  mapLevel,
  type MapView,
  moveView,
} from "./map-city-zoom";
import { busiestCityPlaces, cityNear } from "./map-filters";

type Located = LatLng & { city?: string };

function mapCamera() {
  let view: MapView = {};
  const listeners = new Set<() => void>();
  const show = (next: MapView) => {
    view = next;
    for (const listener of listeners) listener();
  };
  return {
    read: () => view,
    hold: (to: MapLevel) => show(holdLevel(view, to)),
    move: (centre: LatLng, zoom?: number, moved = false) =>
      show(moveView(view, centre, zoom, moved)),
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

function unchangedUntilDifferent(read: () => MapLevel) {
  let last: MapLevel | undefined;
  return () => {
    const next = read();
    if (JSON.stringify(next) !== JSON.stringify(last)) last = next;
    return last ?? next;
  };
}

export function useMapCity(all: readonly Located[]) {
  const [camera] = useState(mapCamera);
  const cities = useMemo(() => mapCities(all), [all]);
  const readLevel = useMemo(
    () =>
      unchangedUntilDifferent(() => {
        const view = camera.read();
        const cityInView = view.centre
          ? cityNear(all, view.centre)
          : busiestCityPlaces(all).find((place) => place.city)?.city;
        return mapLevel(view, cityInView, cities);
      }),
    [camera, all, cities],
  );
  const level = useSyncExternalStore(camera.subscribe, readLevel);
  const city = level.kind === "city" ? level.city : undefined;
  useEffect(() => {
    setMapCityInView(city);
  }, [city]);
  return {
    city,
    level,
    cities,
    hold: camera.hold,
    onCentreChange: camera.move,
  };
}
