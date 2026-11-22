import { MapClusterSheet } from "@/components/map/map-cluster-sheet";
import { analytics } from "@/lib/analytics";
import { t, useAppLocale } from "@/lib/i18n";
import { clusterMapPins, type MapPin } from "@/lib/map-pin-clusters";
import { Image, type ImageRef } from "expo-image";
import { useEffect, useMemo, useState } from "react";
import { useUnistyles } from "react-native-unistyles";

const VISITED_BADGE = require("../../assets/map/visited-badge.png");
let badgeLoad: Promise<ImageRef> | undefined;

function useVisitedBadge() {
  const [badge, setBadge] = useState<ImageRef | null>(null);
  useEffect(() => {
    badgeLoad ??= Image.loadAsync(VISITED_BADGE);
    badgeLoad.then(setBadge, (error: unknown) => {
      badgeLoad = undefined;
      analytics.captureError("map_visited_badge_failed", error);
    });
  }, []);
  return badge;
}

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
  const badge = useVisitedBadge();
  const select = (id: string | undefined) => {
    if (!id) return;
    const group = clusters[markers.findIndex((marker) => marker.id === id)];
    if (!group) return;
    if (group.pins.length > 1) {
      options.clearSelection?.();
      setClusterIds(group.pins.map((pin) => pin.id));
    } else choose(group.id);
  };
  const markers = clusters.map((group) => {
    const first = group.pins[0]!;
    const grouped = group.pins.length > 1;
    const sameColor = group.pins.every(
      (pin) => pin.tintColor === first.tintColor,
    );
    const sameVisit = group.pins.every(
      (pin) => Boolean(pin.visited) === Boolean(first.visited),
    );
    const ownTint = sameColor
      ? (first.tintColor ?? theme.colors.frame)
      : options.clusterText
        ? theme.colors.foreground
        : theme.colors.frame;
    const lead = group.pins.find((pin) => pin.source !== "discover") ?? first;
    return {
      id: `${group.id}|${ownTint}`,
      coordinates: { latitude: group.lat, longitude: group.lng },
      title: !grouped
        ? (first.title ?? first.name)
        : options.clusterText
          ? t("homePlaces.spotCount", { count: group.pins.length })
          : t("mapSheet.groupTitle", {
              name:
                sameColor && sameVisit ? (lead.title ?? lead.name) : lead.name,
              count: group.pins.length - 1,
            }),
      monogram:
        grouped && options.clusterText
          ? options.clusterText(group.pins.length)
          : (lead.text ?? lead.emoji),
      tintColor: group.pins.some((pin) => pin.id === selected)
        ? theme.colors.primary
        : ownTint,
    };
  });
  const badges = badge
    ? markers.flatMap(({ coordinates, title }, index) => {
        const group = clusters[index]!;
        return group.pins.every((pin) => pin.visited)
          ? [
              {
                id: `visited:${group.id}`,
                coordinates,
                title,
                icon: badge,
                anchor: { x: 0.5, y: 1 },
              },
            ]
          : [];
      })
    : [];
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
  return { markers, badges, select, trackZoom, sheet, worldWidth };
}
