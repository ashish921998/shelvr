import { MapClusterSheet } from "@/components/map/map-cluster-sheet";
import { t, useAppLocale } from "@/lib/i18n";
import { clusterMapPins, type MapPin } from "@/lib/map-pin-clusters";
import { useMemo, useState } from "react";
import { useUnistyles } from "react-native-unistyles";

export function useMapPinClusters(
  pins: MapPin[],
  onSelect: (id: string) => void,
  options: {
    selectedId?: string | null;
    clearSelection?: () => void;
    clusterText?: (count: number) => string;
  } = {},
) {
  useAppLocale();
  const { theme, rt } = useUnistyles();
  const [zoom, setZoom] = useState(0);
  const [clusterIds, setClusterIds] = useState<string[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const selected =
    options.selectedId === undefined ? picked : options.selectedId;
  const worldWidth =
    (process.env.EXPO_OS === "ios" ? rt.screen.width : 256) * 2 ** zoom;
  const clusters = useMemo(
    () => clusterMapPins(pins, worldWidth),
    [pins, worldWidth],
  );
  const choose = (id: string) => {
    setPicked(id);
    onSelect(id);
  };
  const select = (id: string | undefined) => {
    if (!id) return;
    const group = clusters.find((group) => group.id === id);
    if (!group) return;
    if (group.pins.length > 1) {
      options.clearSelection?.();
      setClusterIds(group.pins.map((pin) => pin.id));
    } else choose(id);
  };
  const markers = clusters.map((group) => {
    const first = group.pins[0]!;
    const grouped = group.pins.length > 1;
    const sameColor = group.pins.every(
      (pin) => pin.tintColor === first.tintColor,
    );
    return {
      id: group.id,
      coordinates: { latitude: group.lat, longitude: group.lng },
      title: !grouped
        ? (first.title ?? first.name)
        : options.clusterText
          ? t("homePlaces.spotCount", { count: group.pins.length })
          : t("mapSheet.groupTitle", {
              name: first.title ?? first.name,
              count: group.pins.length - 1,
            }),
      monogram:
        grouped && options.clusterText
          ? options.clusterText(group.pins.length)
          : (first.text ?? first.emoji),
      tintColor: group.pins.some((pin) => pin.id === selected)
        ? theme.colors.primary
        : sameColor || !options.clusterText
          ? (first.tintColor ?? theme.colors.frame)
          : theme.colors.foreground,
    };
  });
  const sheet = (
    <MapClusterSheet
      pins={pins.filter((pin) => clusterIds.includes(pin.id))}
      onClose={() => setClusterIds([])}
      onSelect={choose}
    />
  );
  const trackZoom = (zoom: number | undefined) => {
    if (zoom !== undefined) setZoom(Math.floor(zoom * 4) / 4);
  };
  return { markers, select, trackZoom, sheet, worldWidth };
}
