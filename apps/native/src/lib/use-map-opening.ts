import { getLocales } from "expo-localization";
import { useCallback, useEffect, useState } from "react";
import { chooseOpening, newSaveFrame, type Opening } from "@/lib/map-opening";
import {
  readKnownSaves,
  readLastView,
  writeKnownSaves,
} from "@/lib/map-opening-store";
const NEW_SAVE_WINDOW_MS = 8000;
export function useMapOpening(
  ready: boolean,
  located: boolean,
  hasFit: boolean,
): Opening | undefined {
  const [opening, setOpening] = useState<Opening | undefined>(undefined);
  if (!opening && ready)
    setOpening(
      chooseOpening({
        located,
        last: readLastView(),
        hasFit,
        regionCode: getLocales()[0]?.regionCode,
      }),
    );
  return opening;
}

type SavedPlace = { itemId: string; city?: string; lat: number; lng: number };
export function useNewSaveFrame(
  all: SavedPlace[] | undefined,
  suppressed: boolean,
) {
  const [known] = useState(readKnownSaves);
  const [open, setOpen] = useState(true);
  const [latched, setLatched] = useState<
    ReturnType<typeof newSaveFrame> | undefined
  >(undefined);
  const loaded = all !== undefined;
  useEffect(() => {
    if (!loaded) return;
    const timer = setTimeout(() => setOpen(false), NEW_SAVE_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [loaded]);
  useEffect(() => {
    if (all) writeKnownSaves(all.map((place) => place.itemId));
  }, [all]);
  const close = useCallback(() => setOpen(false), []);
  if (suppressed && (open || latched)) {
    setOpen(false);
    setLatched(undefined);
  }
  const found =
    open && !suppressed && !latched && all
      ? newSaveFrame(all, known)
      : undefined;
  if (found) setLatched(found);
  return { frame: suppressed ? undefined : (latched ?? found), close };
}
