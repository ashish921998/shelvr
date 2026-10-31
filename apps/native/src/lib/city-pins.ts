import { linkSource, type LinkSource } from "@convex/model/externalUrl";
import { distanceKm, middleOf, uniquePlacePins } from "@convex/model/trip";

export type CityPin = {
  itemId: string;
  name: string;
  lat: number;
  lng: number;
  appleId?: string;
  category?: string;
  number: number;
};

export function cityPinId(pin: Omit<CityPin, "number">): string {
  return `${pin.itemId}:${pin.name}:${pin.lat}:${pin.lng}`;
}

/** Every place pin the city's saves carry, tagged with the save it came from. */
export function cityPins(
  saves: {
    _id: string;
    placePins?: {
      name: string;
      lat: number;
      lng: number;
      appleId?: string;
      category?: string;
    }[];
  }[],
): CityPin[] {
  return uniquePlacePins(
    saves.flatMap((save) =>
      (save.placePins ?? []).map((pin) => ({ itemId: save._id, ...pin })),
    ),
  ).map((pin, index) => ({ ...pin, number: index + 1 }));
}

const FRAME_SPREAD = 3;
const FRAME_MIN_KM = 10;

/**
 * The pins the city map opens on: those near the middle of the rest, so one place far out of town
 * does not zoom the map out to the whole region. A pin counts as far when it is over three times the
 * typical distance from the middle, and never within 10 km. Far pins stay on the map.
 */
export function framedPins<T extends { lat: number; lng: number }>(
  pins: T[],
): T[] {
  const middle = middleOf(pins);
  if (middle === null || pins.length < 3) return pins;
  const distances = pins.map((pin) => distanceKm(pin, middle));
  const typical = [...distances].sort((a, b) => a - b)[
    Math.floor(distances.length / 2)
  ];
  const reach = Math.max(FRAME_MIN_KM, typical * FRAME_SPREAD);
  return pins.filter((_, i) => distances[i] <= reach);
}

/** One row per mapped place, plus every save not represented by a place row. */
type CityRow<T> =
  | {
      kind: "place";
      id: string;
      number: number;
      name: string;
      pin: CityPin;
      item: T;
    }
  | { kind: "save"; id: string; item: T };

export function cityRows<T extends { _id: string; placePins?: unknown[] }>(
  saves: T[],
  pins: CityPin[],
): CityRow<T>[] {
  const items = new Map(saves.map((save) => [save._id, save]));
  const pinnedIds = new Set(pins.map((pin) => pin.itemId));
  return [
    ...pins.flatMap((pin): CityRow<T>[] => {
      const item = items.get(pin.itemId);
      return item
        ? [
            {
              kind: "place",
              id: cityPinId(pin),
              number: pin.number,
              name: pin.name,
              pin,
              item,
            },
          ]
        : [];
    }),
    ...saves
      .filter((save) => !pinnedIds.has(save._id))
      .map((item) => ({
        kind: "save" as const,
        id: item._id,
        item,
      })),
  ];
}

const SOURCE_NAMES: Record<LinkSource, string> = {
  tiktok: "TikTok",
  instagram: "Instagram",
  x: "X",
  pinterest: "Pinterest",
  youtube: "YouTube",
};

/** The short line under a save's title: the platform it came from, else its author or site. */
export function saveSource(save: {
  url?: string;
  author?: string;
  siteName?: string;
}): string | undefined {
  const platform = linkSource(save.url);
  return platform ? SOURCE_NAMES[platform] : (save.author ?? save.siteName);
}

/**
 * expo-maps on iOS turns a zoom into a square region (as many degrees of latitude as of longitude)
 * and MapKit fits all of it, so a short, wide map shows far more than the zoom says. This returns
 * the iOS zoom whose square, once fitted, gives the scale of `zoom` on a 256-point world.
 */
export function appleZoom(
  zoom: number,
  latitude: number,
  width: number,
  height: number,
): number {
  const degreesPerPoint = 360 / (256 * 2 ** zoom);
  const cos = Math.cos((latitude * Math.PI) / 180);
  return Math.log2(360 / (degreesPerPoint * Math.min(width, height * cos)));
}
