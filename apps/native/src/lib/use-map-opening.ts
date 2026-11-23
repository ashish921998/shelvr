import { getLocales } from "expo-localization";
import { useCallback, useEffect, useState } from "react";
import {
  chooseOpening,
  newSaveFrame,
  sampleCityFor,
  type Opening,
} from "@/lib/map-opening";
import {
  claimMapOpening,
  readKnownSaves,
  readLastView,
  writeKnownSaves,
} from "@/lib/map-opening-store";
const NEW_SAVE_WINDOW_MS = 8000;

function regionCode() {
  return getLocales()[0]?.regionCode;
}

export function useRegionHasSample(): boolean {
  const [has] = useState(() => sampleCityFor(regionCode()) !== undefined);
  return has;
}

export function useMapOpening(
  ready: boolean,
  owner: string | undefined,
  located: boolean,
  hasFit: boolean,
): Opening | undefined {
  const [opening, setOpening] = useState<Opening | undefined>(undefined);
  if (!opening && ready && owner !== undefined) {
    claimMapOpening(owner);
    setOpening(
      chooseOpening({
        located,
        last: readLastView(),
        hasFit,
        regionCode: regionCode(),
      }),
    );
  }
  return opening;
}

type SavedPlace = { itemId: string; city?: string; lat: number; lng: number };
export function useNewSaveFrame(
  all: SavedPlace[] | undefined,
  suppressed: boolean,
  ready: boolean,
) {
  const [seen, setSeen] = useState<
    { known: ReturnType<typeof readKnownSaves> } | undefined
  >(undefined);
  const [open, setOpen] = useState(true);
  const [latched, setLatched] = useState<
    ReturnType<typeof newSaveFrame> | undefined
  >(undefined);
  if (ready && !seen) setSeen({ known: readKnownSaves() });
  const started = seen !== undefined;
  useEffect(() => {
    if (!started) return;
    const timer = setTimeout(() => setOpen(false), NEW_SAVE_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [started]);
  useEffect(() => {
    if (all && started) writeKnownSaves(all.map((place) => place.itemId));
  }, [all, started]);
  const close = useCallback(() => setOpen(false), []);
  if (suppressed && (open || latched)) {
    setOpen(false);
    setLatched(undefined);
  }
  const found =
    open && seen && !suppressed && !latched && all
      ? newSaveFrame(all, seen.known)
      : undefined;
  if (found) setLatched(found);
  return { frame: suppressed ? undefined : (latched ?? found), close };
}
