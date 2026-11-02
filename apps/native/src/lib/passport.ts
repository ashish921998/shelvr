import { analytics } from "@/lib/analytics";
import { haptics } from "@/lib/haptics";
import { t } from "@/lib/i18n";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { placeKey } from "@convex/model/plan";
import { cityKey } from "@convex/model/trip";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useConvexAuth, useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useMemo, useRef, useState } from "react";
import { Alert } from "react-native";

export type Stamp = FunctionReturnType<
  typeof api.placeVisits.getPassport
>[number];

export type UnstampedPlace = FunctionReturnType<
  typeof api.placeVisits.listUnstampedPlaces
>[number];

export type StampSurface = "city" | "passport";

export type StampCity = { city: string | null; stamps: Stamp[] };

export type OpenStamp = {
  itemId: Id<"items">;
  name: string;
  city: string;
  cover: string | null;
  at: number | null;
  fresh: boolean;
};

export function usePassport() {
  const { isAuthenticated } = useConvexAuth();
  const passport = useQuery(
    convexQuery(api.placeVisits.getPassport, isAuthenticated ? {} : "skip"),
  );
  const stamps = passport.data;
  const byKey = useMemo(
    () => new Map((stamps ?? []).map((stamp) => [stamp.key, stamp])),
    [stamps],
  );
  return {
    stamps,
    stampFor: (name: string) => byKey.get(placeKey(name)),
  };
}

export function passportCounts(stamps: readonly Stamp[]) {
  const cities = new Set(
    stamps.flatMap((stamp) => (stamp.city ? [cityKey(stamp.city)] : [])),
  );
  const countries = new Set(
    stamps.flatMap((stamp) => (stamp.countryCode ? [stamp.countryCode] : [])),
  );
  return {
    places: stamps.length,
    cities: cities.size,
    countries: countries.size > 0 ? countries.size : null,
  };
}

export function stampDate(stamp: Pick<Stamp, "visitedAt" | "backfilled">) {
  return stamp.backfilled ? null : stamp.visitedAt;
}

export function passportCities(stamps: readonly Stamp[]): StampCity[] {
  const groups = new Map<string, StampCity>();
  for (const stamp of stamps) {
    const key = stamp.city ? cityKey(stamp.city) : "";
    const group = groups.get(key);
    if (group) group.stamps.push(stamp);
    else groups.set(key, { city: stamp.city ?? null, stamps: [stamp] });
  }
  return [...groups.values()].sort(
    (a, b) => Number(a.city === null) - Number(b.city === null),
  );
}

export function unstampedCities(places: readonly UnstampedPlace[]) {
  const groups = new Map<string, { city: string; places: UnstampedPlace[] }>();
  for (const place of places) {
    const key = cityKey(place.city);
    const group = groups.get(key);
    if (group) group.places.push(place);
    else groups.set(key, { city: place.city, places: [place] });
  }
  return [...groups.values()];
}

export function wentInCity(stamps: readonly Stamp[] | undefined, city: string) {
  const key = cityKey(city);
  return (stamps ?? []).filter(
    (stamp) => stamp.city && cityKey(stamp.city) === key,
  ).length;
}

export function openStampOf(stamp: Stamp, city: string): OpenStamp {
  return {
    itemId: stamp.itemId,
    name: stamp.name,
    city: stamp.city ?? city,
    cover: stamp.cover,
    at: stampDate(stamp),
    fresh: false,
  };
}

export function useStamping(surface: StampSurface) {
  const setVisited = useMutation(api.placeVisits.setVisited);
  const working = useRef(false);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<OpenStamp | null>(null);

  const run = async (visited: boolean, place: OpenStamp) => {
    if (working.current) return false;
    working.current = true;
    setBusy(true);
    try {
      await setVisited({ itemId: place.itemId, name: place.name, visited });
      void (visited ? haptics.impact("medium") : haptics.selection());
      analytics.capture(visited ? "place_stamped" : "place_unstamped", {
        surface,
      });
      return true;
    } catch (error) {
      analytics.captureError("place_stamp_failed", error);
      Alert.alert(t("errors.unexpectedTitle"), t("errors.retrySoon"));
      return false;
    } finally {
      working.current = false;
      setBusy(false);
    }
  };

  return {
    busy,
    open,
    show: setOpen,
    close: () => setOpen(null),
    stamp: async (place: Omit<OpenStamp, "at" | "fresh">) => {
      const stamped = { ...place, at: Date.now(), fresh: true };
      if (await run(true, stamped)) setOpen(stamped);
    },
    remove: async () => {
      if (open !== null && (await run(false, open))) setOpen(null);
    },
  };
}
