import { cityPinId } from "@/lib/city-pins";
import { motion } from "@/lib/motion";
import type { ListRow } from "@/lib/shared-lists";
import { cityKey } from "@convex/model/trip";
import { useEffect, useMemo, useState } from "react";
import { useReducedMotion } from "react-native-reanimated";

const MAX_SINGLE_DROPS = 5;
const EMPTY: readonly string[] = [];

export function dropOrder(
  rows: readonly ListRow[],
  shown: ReadonlySet<string>,
) {
  const byAdded = (a: ListRow, b: ListRow) => a.place.addedAt - b.place.addedAt;
  const old = rows
    .filter((row) => !row.place.isNew)
    .sort(byAdded)
    .map((row) => row.pin);
  const fresh = rows
    .filter((row) => row.place.isNew)
    .sort(byAdded)
    .map((row) => row.pin);
  const dropped = fresh.filter((pin) => shown.has(cityPinId(pin)));
  const waiting = fresh.filter((pin) => !shown.has(cityPinId(pin)));
  return {
    pins: [...old, ...dropped, ...waiting],
    settled: old.length + dropped.length,
    waiting: waiting.map(cityPinId),
  };
}

export function useFreshPinDrop(
  rows: readonly ListRow[],
  city: string,
  selected: string | null = null,
) {
  const reduced = useReducedMotion();
  const key = cityKey(city);
  const [shownByCity, setShownByCity] = useState<
    ReadonlyMap<string, readonly string[]>
  >(() => new Map());
  const shown = shownByCity.get(key) ?? EMPTY;
  if (
    selected !== null &&
    !shown.includes(selected) &&
    rows.some((row) => cityPinId(row.pin) === selected)
  ) {
    setShownByCity(new Map(shownByCity).set(key, [...shown, selected]));
  }
  const order = useMemo(() => dropOrder(rows, new Set(shown)), [rows, shown]);
  useEffect(() => {
    if (reduced || order.waiting.length === 0) return;
    const batch =
      shown.length >= MAX_SINGLE_DROPS
        ? order.waiting
        : order.waiting.slice(0, 1);
    const timer = setTimeout(() => {
      setShownByCity((current) =>
        new Map(current).set(key, [...(current.get(key) ?? EMPTY), ...batch]),
      );
    }, motion.duration.stagger);
    return () => clearTimeout(timer);
  }, [reduced, order, shown, key]);
  return {
    pins: order.pins,
    visible: reduced ? order.pins.length : order.settled,
  };
}
