import { analytics } from "@/lib/analytics";
import { haptics } from "@/lib/haptics";
import { t } from "@/lib/i18n";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { cityKey } from "@convex/model/trip";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useConvexAuth, useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useRef, useState } from "react";
import { Alert } from "react-native";

export type Stamp = FunctionReturnType<
  typeof api.placeVisits.getPassport
>[number];

export type UnstampedPlace = FunctionReturnType<
  typeof api.placeVisits.listUnstampedPlaces
>[number];

type StampCity = { city: string | null; stamps: Stamp[] };

export type OpenStamp = {
  itemId: Id<"items">;
  name: string;
  city: string;
  cover: string | null;
  at: number | null;
  spot?: { lat: number; lng: number };
};

export function usePassport() {
  const { isAuthenticated } = useConvexAuth();
  const passport = useQuery(
    convexQuery(api.placeVisits.getPassport, isAuthenticated ? {} : "skip"),
  );
  return { stamps: passport.data, failed: passport.isError };
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

export type WentFilter = "all" | "want" | "went";

export function filterByWent<Place>(
  places: readonly Place[],
  filter: WentFilter,
  went: (place: Place) => boolean,
): Place[] {
  if (filter === "all") return [...places];
  return places.filter((place) => went(place) === (filter === "went"));
}

export function stampId(stamp: Stamp): string {
  return `${stamp.key}:${stamp.lat ?? ""}:${stamp.lng ?? ""}`;
}

export function wentInCity(stamps: readonly Stamp[] | undefined, city: string) {
  const key = cityKey(city);
  return (stamps ?? []).filter(
    (stamp) => stamp.city && cityKey(stamp.city) === key,
  ).length;
}

export const CARD_PLACES = 6;

export type CardPlace = {
  number: number;
  name: string;
  lat?: number;
  lng?: number;
};

export type SavedOn = "instagram" | "tiktok" | "both" | "elsewhere";

function savedOnOf(stamps: readonly Stamp[]): SavedOn {
  const apps = new Set(stamps.map((stamp) => stamp.source));
  if (apps.has("instagram") && apps.has("tiktok")) return "both";
  if (apps.has("instagram")) return "instagram";
  if (apps.has("tiktok")) return "tiktok";
  return "elsewhere";
}

export function shareCardOf(stamps: readonly Stamp[], city: string) {
  const key = cityKey(city);
  const inCity = stamps.filter(
    (stamp) => stamp.city && cityKey(stamp.city) === key,
  );
  const dated = inCity.find((stamp) => stampDate(stamp) !== null);
  return {
    total: inCity.length,
    month: dated ? dated.visitedAt : null,
    savedOn: savedOnOf(inCity),
    places: inCity.slice(0, CARD_PLACES).map(
      (stamp, index): CardPlace => ({
        number: index + 1,
        name: stamp.name,
        ...(stamp.lat !== undefined && stamp.lng !== undefined
          ? { lat: stamp.lat, lng: stamp.lng }
          : {}),
      }),
    ),
  };
}

type CardSurface = "stamp" | "passport";

export function shareCardHref(city: string, surface: CardSurface) {
  return { pathname: "/passport-card", params: { city, surface } } as const;
}

export function openStampOf(stamp: Stamp, city: string): OpenStamp {
  return {
    itemId: stamp.itemId,
    name: stamp.name,
    city: stamp.city ?? city,
    cover: stamp.cover,
    at: stampDate(stamp),
    ...(stamp.lat !== undefined && stamp.lng !== undefined
      ? { spot: { lat: stamp.lat, lng: stamp.lng } }
      : {}),
  };
}

export function useStamping() {
  const setVisited = useMutation(api.placeVisits.setVisited);
  const working = useRef(false);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<OpenStamp | null>(null);

  const remove = async () => {
    if (open === null || working.current) return;
    working.current = true;
    setBusy(true);
    try {
      await setVisited({
        itemId: open.itemId,
        name: open.name,
        visited: false,
        ...(open.spot ? { spot: open.spot } : {}),
      });
      void haptics.selection();
      analytics.capture("place_unstamped", { surface: "passport" });
      setOpen((current) => (current === open ? null : current));
    } catch (error) {
      analytics.captureError("place_unstamp_failed", error);
      Alert.alert(t("errors.unexpectedTitle"), t("errors.retrySoon"));
    } finally {
      working.current = false;
      setBusy(false);
    }
  };

  return { busy, open, show: setOpen, close: () => setOpen(null), remove };
}
