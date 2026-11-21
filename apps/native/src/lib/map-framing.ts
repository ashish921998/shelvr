import { useMemo, useState } from "react";

type Framing<T> = { key: string; places: T[]; opened: boolean };

type Anchored = { source: "own" | "discover"; lat: number; lng: number };

export function anchorsOf<T extends Anchored>(shown: T[]): T[] {
  const own = shown.filter((place) => place.source === "own");
  return own.length > 0 ? own : shown;
}

export function anchorsKnown(
  anchorEntries: readonly Anchored[],
  areaLoaded: boolean,
): boolean {
  return areaLoaded || anchorEntries.some((place) => place.source === "own");
}

export function useAnchors<T extends Anchored>(
  shown: T[],
  areaLoaded: boolean,
): {
  anchorEntries: T[];
  anchors: { lat: number; lng: number }[] | undefined;
} {
  const anchorEntries = useMemo(() => anchorsOf(shown), [shown]);
  const anchors = useMemo(
    () => anchorEntries.map(({ lat, lng }) => ({ lat, lng })),
    [anchorEntries],
  );
  return {
    anchorEntries,
    anchors: anchorsKnown(anchorEntries, areaLoaded) ? anchors : undefined,
  };
}

export function nextFraming<T>(
  held: Framing<T>,
  live: T[],
  key: string,
  canOpen = true,
): Framing<T> {
  const opened = held.opened || (canOpen && live.length > 0);
  if (held.key !== key || opened !== held.opened)
    return { key, places: live, opened };
  return held;
}

export function useHeldFraming<T>(
  live: T[],
  key: string,
  canOpen: boolean,
): T[] {
  const [held, setHeld] = useState<Framing<T>>(() => ({
    key,
    places: live,
    opened: live.length > 0,
  }));
  const next = nextFraming(held, live, key, canOpen);
  if (next !== held) setHeld(next);
  return next.places;
}
