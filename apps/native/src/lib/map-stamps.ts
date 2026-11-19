import { linkSource } from "@convex/model/externalUrl";
import { uniquePlacePins } from "@convex/model/trip";
import { clusterMapPins } from "@/lib/map-pin-clusters";

type Place = { name: string; lat: number; lng: number; appleId?: string };

export type StampSave = {
  _id: string;
  _creationTime: number;
  url?: string;
  title?: string;
  imageUrl: string | null;
  heroImageUrl?: string;
  placePins?: Place[];
};

export type MapStamp = {
  id: string;
  itemId: string;
  lat: number;
  lng: number;
  cover: string;
  count: number;
  title?: string;
  places: string[];
  pins: Place[];
  newest: number;
};

export type StampGroup = MapStamp & { saves: MapStamp[] };

const REELS = new Set(["instagram", "tiktok", "youtube"]);

export function placeKey(place: Place): string {
  return `${place.name}:${place.lat}:${place.lng}`;
}

export function saveCover(save: StampSave): string | undefined {
  return save.imageUrl ?? save.heroImageUrl;
}

export function reelStamps(saves: readonly StampSave[]): MapStamp[] {
  return saves.flatMap((save) => {
    const first = save.placePins?.[0];
    const cover = saveCover(save);
    const source = linkSource(save.url);
    if (!first || !cover || !source || !REELS.has(source)) return [];
    return [
      {
        id: `stamp:${save._id}`,
        itemId: save._id,
        lat: first.lat,
        lng: first.lng,
        cover,
        count: save.placePins!.length,
        title: save.title,
        places: save.placePins!.map(placeKey),
        pins: save.placePins!,
        newest: save._creationTime,
      },
    ];
  });
}

type Tagged = Place & { shown?: Place; stamp?: number; order?: number };

export function shownStamps(
  stamps: readonly MapStamp[],
  shown: readonly Place[],
  known: readonly Place[] = [],
): MapStamp[] {
  const matches = stamps.map(() => new Map<number, Place>());
  uniquePlacePins<Tagged>(
    [
      ...shown.map((place) => ({ ...place, shown: place })),
      ...known,
      ...stamps.flatMap((stamp, index) =>
        stamp.pins.map((pin, order) => ({ ...pin, stamp: index, order })),
      ),
    ],
    (kept, repeat) => {
      if (kept.shown && repeat.stamp !== undefined) {
        matches[repeat.stamp]!.set(repeat.order!, kept.shown);
      }
      return kept;
    },
  );
  return stamps.flatMap((stamp, index) => {
    const found = [...matches[index]!]
      .sort(([a], [b]) => a - b)
      .map(([, place]) => place);
    const anchor = found[0];
    if (!anchor) return [];
    const places = [...new Set(found.map(placeKey))];
    return [{ ...stamp, lat: anchor.lat, lng: anchor.lng, places }];
  });
}

export function stampedPlaces(stamps: readonly MapStamp[]): Set<string> {
  return new Set(stamps.map((stamp) => stamp.places[0]!));
}

export function groupStamps(
  stamps: readonly MapStamp[],
  worldWidth: number,
): StampGroup[] {
  return clusterMapPins(stamps, worldWidth).map((group) => {
    const saves = [...group.pins].sort((a, b) => b.newest - a.newest);
    return { ...saves[0]!, id: group.id, saves };
  });
}
