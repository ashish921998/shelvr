import { linkSource, type LinkSource } from "@convex/model/externalUrl";
import { uniquePlacePins } from "@convex/model/trip";

export type CityPin = {
  itemId: string;
  name: string;
  lat: number;
  lng: number;
};

export function cityPinId(pin: CityPin): string {
  return `${pin.itemId}:${pin.name}:${pin.lat}:${pin.lng}`;
}

/** Every place pin the city's saves carry, tagged with the save it came from. */
export function cityPins(
  saves: {
    _id: string;
    placePins?: { name: string; lat: number; lng: number }[];
  }[],
): CityPin[] {
  return uniquePlacePins(
    saves.flatMap((save) =>
      (save.placePins ?? []).map((pin) => ({ itemId: save._id, ...pin })),
    ),
  );
}

/** One row per mapped place, plus every save not represented by a place row. */
export function cityRows<T extends { _id: string; placePins?: unknown[] }>(
  saves: T[],
  pins: CityPin[],
) {
  const items = new Map(saves.map((save) => [save._id, save]));
  const pinnedIds = new Set(pins.map((pin) => pin.itemId));
  return [
    ...pins.flatMap((pin, index) => {
      const item = items.get(pin.itemId);
      return item
        ? [{ id: cityPinId(pin), number: index + 1, name: pin.name, item }]
        : [];
    }),
    ...saves
      .filter((save) => !pinnedIds.has(save._id))
      .map((item) => ({
        id: item._id,
        number: undefined,
        name: undefined,
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
