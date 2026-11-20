import { useMemo, useState } from "react";

type Framing<T> = { key: string; places: T[] };

type Anchored = { source: "own" | "discover"; lat: number; lng: number };

export function anchorsOf<T extends Anchored>(shown: T[]): T[] {
  const own = shown.filter((place) => place.source === "own");
  return own.length > 0 ? own : shown;
}

export function useAnchors<T extends Anchored>(
  shown: T[],
): { anchorEntries: T[]; anchors: { lat: number; lng: number }[] } {
  const anchorEntries = useMemo(() => anchorsOf(shown), [shown]);
  const anchors = useMemo(
    () => anchorEntries.map(({ lat, lng }) => ({ lat, lng })),
    [anchorEntries],
  );
  return { anchorEntries, anchors };
}

export function nextFraming<T>(
  held: Framing<T>,
  live: T[],
  key: string,
): Framing<T> {
  if (held.key !== key || (held.places.length === 0 && live.length > 0))
    return { key, places: live };
  return held;
}

export function useHeldFraming<T>(live: T[], key: string): T[] {
  const [held, setHeld] = useState<Framing<T>>({ key, places: live });
  const next = nextFraming(held, live, key);
  if (next !== held) setHeld(next);
  return next.places;
}
