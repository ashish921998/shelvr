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

type Venue = Place & { members: string[] };

const member = (itemId: string, order: number) => `${itemId}#${order}`;

export function shownStamps(
  stamps: readonly MapStamp[],
  saves: readonly StampSave[],
  shown: ReadonlySet<string>,
): MapStamp[] {
  const venueOf = new Map<string, Place>();
  const venues = uniquePlacePins<Venue>(
    saves.flatMap((save) =>
      (save.placePins ?? []).map((pin, order) => ({
        ...pin,
        members: [member(save._id, order)],
      })),
    ),
    (kept, repeat) => ({
      ...kept,
      members: [...kept.members, ...repeat.members],
    }),
  );
  for (const venue of venues) {
    for (const key of venue.members) venueOf.set(key, venue);
  }
  return stamps.flatMap((stamp) => {
    const found = stamp.pins
      .map((_, order) => venueOf.get(member(stamp.itemId, order)))
      .filter(
        (venue): venue is Place =>
          venue !== undefined && shown.has(placeKey(venue)),
      );
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
