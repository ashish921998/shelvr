import { cityPins } from "@/lib/city-pins";
import { sheetSnaps } from "@/lib/city-sheet";
import { placeKey, reelStamps, shownStamps } from "@/lib/map-stamps";
import { api } from "@convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { useUnistyles } from "react-native-unistyles";

const NO_SAVES: never[] = [];

type Place = { name: string; lat: number; lng: number };

type Layout = {
  hidden: boolean;
  mapHeight: number;
  barHeight: number;
  insetTop: number;
};

export function useCityStamps(
  city: string | undefined,
  onMap: Place[],
  layout: Layout,
) {
  const { theme } = useUnistyles();
  const items = useQuery(
    convexQuery(api.items.listCityItems, city ? { city } : "skip"),
  );
  const saves = items.data ?? NO_SAVES;
  const placeCount = useMemo(() => cityPins(saves).length, [saves]);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const stamps = useMemo(
    () => shownStamps(reelStamps(saves), onMap),
    [saves, onMap],
  );
  const highlightedPlaces = useMemo(
    () =>
      new Set(
        stamps.find((stamp) => stamp.itemId === highlighted)?.places ??
          saves
            .find((save) => save._id === highlighted)
            ?.placePins?.map(placeKey) ??
          [],
      ),
    [stamps, saves, highlighted],
  );
  const stampColors = useMemo(
    () => ({
      frame: theme.colors.frame,
      badge: theme.colors.foreground,
      onBadge: theme.colors.surface,
    }),
    [theme],
  );
  const sheet = useMapSheetLayout({
    ...layout,
    show:
      city !== undefined &&
      saves.length > 0 &&
      !layout.hidden &&
      layout.mapHeight > 0,
  });
  return {
    sheet,
    saves,
    placeCount,
    stamps,
    stampColors,
    highlightedPlaces,
    setHighlighted,
  };
}

function useMapSheetLayout({
  show,
  mapHeight,
  barHeight,
  insetTop,
}: Layout & { show: boolean }) {
  const [header, setHeader] = useState(96);
  const [cards, setCards] = useState(232);
  const snaps = useMemo(
    () =>
      sheetSnaps({
        height: mapHeight,
        insetTop,
        insetBottom: barHeight,
        middle: mapHeight - barHeight - header - cards,
        collapsedVisible: header,
      }),
    [mapHeight, barHeight, header, cards, insetTop],
  );
  const top = useSharedValue(snaps.middle);
  useEffect(() => {
    top.set(snaps.middle);
  }, [snaps.middle, top]);
  const aboveSheet = useAnimatedStyle(() => ({
    bottom: show ? mapHeight - Math.max(top.get(), snaps.middle) : barHeight,
  }));
  return {
    show,
    snaps,
    top,
    aboveSheet,
    coveredBottom: show ? mapHeight - snaps.middle : barHeight,
    onHeaderHeight: setHeader,
    onCardsHeight: setCards,
  };
}
