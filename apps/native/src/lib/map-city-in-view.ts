import { useSyncExternalStore } from "react";

let current: string | undefined;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function snapshot() {
  return current;
}

export function setMapCityInView(city: string | undefined) {
  if (city === current) return;
  current = city;
  for (const listener of listeners) listener();
}

export function useMapCityInView() {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
