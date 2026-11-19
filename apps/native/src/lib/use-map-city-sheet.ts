import { cityPins } from "@/lib/city-pins";
import { sheetSnaps } from "@/lib/city-sheet";
import { api } from "@convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useAnimatedStyle, useSharedValue } from "react-native-reanimated";

const NO_SAVES: never[] = [];

type Layout = {
  hidden: boolean;
  mapHeight: number;
  barHeight: number;
  insetTop: number;
};

export function useMapCitySheet(
  city: string | undefined,
  placesOnMap: number,
  layout: Layout,
) {
  const items = useQuery(
    convexQuery(api.items.listCityItems, city ? { city } : "skip"),
  );
  const saves = items.data ?? NO_SAVES;
  const placeCount = useMemo(() => cityPins(saves).length, [saves]);
  const room = !layout.hidden && layout.mapHeight > 0;
  const sheet = useMapSheetLayout({
    ...layout,
    show: room && city !== undefined && saves.length > 0,
    reserve:
      room &&
      (city === undefined
        ? placesOnMap > 0
        : items.isPending || saves.length > 0),
  });
  return { sheet, saves, placeCount };
}

function useMapSheetLayout({
  show,
  reserve,
  mapHeight,
  barHeight,
  insetTop,
}: Layout & { show: boolean; reserve: boolean }) {
  const [header, setHeader] = useState(96);
  const snaps = useMemo(
    () =>
      sheetSnaps({
        height: mapHeight,
        insetTop,
        insetBottom: barHeight,
        middle: mapHeight - barHeight - header,
        collapsedVisible: header,
      }),
    [mapHeight, barHeight, header, insetTop],
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
    coveredBottom: reserve ? mapHeight - snaps.middle : barHeight,
    onHeaderHeight: (height: number) => setHeader(Math.round(height)),
  };
}
