import { linkSource } from "@convex/model/externalUrl";
import { clusterMapPins } from "@/lib/map-pin-clusters";

type Place = { name: string; lat: number; lng: number };

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
        newest: save._creationTime,
      },
    ];
  });
}

export function shownStamps(
  stamps: readonly MapStamp[],
  shown: ReadonlySet<string>,
): MapStamp[] {
  return stamps.filter((stamp) => stamp.places.some((key) => shown.has(key)));
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
