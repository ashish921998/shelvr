import { analytics } from "@/lib/analytics";
import { usePaywallGuard } from "@/lib/entitlement";
import { haptics } from "@/lib/haptics";
import { t } from "@/lib/i18n";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { placeKey } from "@convex/model/plan";
import { saveErrorCode } from "@convex/model/saveErrors";
import { cityKey } from "@convex/model/trip";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useConvexAuth, useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useCallback, useMemo, useRef, useState } from "react";
import { Alert } from "react-native";

export type Stamp = FunctionReturnType<
  typeof api.placeVisits.getPassport
>[number];

export type UnstampedPlace = FunctionReturnType<
  typeof api.placeVisits.listUnstampedPlaces
>[number];

type StampSurface = "city" | "passport";

type StampCity = { city: string | null; stamps: Stamp[] };

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
  const stampFor = useCallback(
    (name: string) => byKey.get(placeKey(name)),
    [byKey],
  );
  return { stamps, stampFor, failed: passport.isError };
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

export function filterByWent<Place extends { name: string }>(
  places: readonly Place[],
  filter: WentFilter,
  went: (name: string) => boolean,
): Place[] {
  if (filter === "all") return [...places];
  return places.filter((place) => went(place.name) === (filter === "went"));
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
    fresh: false,
  };
}

export function useStamping(surface: StampSurface) {
  const setVisited = useMutation(api.placeVisits.setVisited);
  const { guard } = usePaywallGuard("passport");
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
      analytics.captureError(
        visited ? "place_stamp_failed" : "place_unstamp_failed",
        error,
      );
      const paywalled =
        saveErrorCode(error) === "pro_required" && !(await guard());
      if (!paywalled) {
        Alert.alert(t("errors.unexpectedTitle"), t("errors.retrySoon"));
      }
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
