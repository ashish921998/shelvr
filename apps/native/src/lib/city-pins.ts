import { linkSource, type LinkSource } from "@convex/model/externalUrl";

export type CityPin = {
  itemId: string;
  name: string;
  lat: number;
  lng: number;
};

/** Every place pin the city's saves carry, tagged with the save it came from. */
export function cityPins(
  saves: {
    _id: string;
    placePins?: { name: string; lat: number; lng: number }[];
  }[],
): CityPin[] {
  return saves.flatMap((save) =>
    (save.placePins ?? []).map((pin) => ({ itemId: save._id, ...pin })),
  );
}

/** Number each save that has a pin, in list order, so a row's badge matches its pins. */
export function numberSaves(
  saves: { _id: string }[],
  pins: Pick<CityPin, "itemId">[],
): Map<string, number> {
  const located = new Set(pins.map((pin) => pin.itemId));
  const numbers = new Map<string, number>();
  for (const save of saves) {
    if (located.has(save._id)) numbers.set(save._id, numbers.size + 1);
  }
  return numbers;
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
