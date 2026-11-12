import type { Doc } from "../_generated/dataModel";
import { instagramMedia, youtubeVideoId } from "./externalUrl";
import { placeEmoji } from "./placeEmoji";
import type { Placed } from "./placeIdentity";
import {
  mergeVenueKinds,
  placeKinds,
  type Cuisine,
  type PlaceKind,
} from "./placeKinds";
import { visitAtPin, type VisitMark } from "./placeVisits";
import { isGenericPlaceName, isStreetAddress } from "./plan";
import {
  MAX_PUBLIC_MAP_CITIES,
  MAX_PUBLIC_MAP_PLACES_PER_CITY,
  MAX_PUBLIC_MAP_SAVES_PER_CITY,
} from "./publicMapLimits";
import { cityKey, countCities, pinsForCity, uniquePlacePins } from "./trip";

export type PublicPost = {
  site: "instagram" | "tiktok" | "youtube";
  url: string;
};

export type PublicPlace = {
  name: string;
  lat: number;
  lng: number;
  emoji?: string;
  went: boolean;
  post?: PublicPost;
};

export type PublicCity = { city: string; places: PublicPlace[] };

export type PublicCityPreview = {
  city: string;
  places: { name: string; went: boolean }[];
};

type PublicPin = {
  name: string;
  lat: number;
  lng: number;
  appleId?: string;
  category?: string;
  cuisine?: Cuisine;
  kinds: PlaceKind[];
  went: boolean;
  post?: PublicPost;
};

const PUBLIC_MAP_TOKEN = /^[0-9a-f]{32}$/;
const TIKTOK_HOSTS = new Set(["tiktok.com", "www.tiktok.com", "m.tiktok.com"]);
const TIKTOK_POST_PATH = /^\/@([A-Za-z0-9._]+)\/video\/(\d+)\/?$/;

export function isPublicMapToken(token: string): boolean {
  return PUBLIC_MAP_TOKEN.test(token);
}

function tikTokPostUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    if (!TIKTOK_HOSTS.has(parsed.hostname.toLowerCase())) return undefined;
    const match = TIKTOK_POST_PATH.exec(parsed.pathname);
    return match
      ? `https://www.tiktok.com/@${match[1]}/video/${match[2]}`
      : undefined;
  } catch {
    return undefined;
  }
}

export function publicPost(item: {
  type: string;
  url?: string;
}): PublicPost | undefined {
  if (item.type !== "link" || !item.url) return undefined;
  const media = instagramMedia(item.url);
  if (media?.shortcode !== undefined) {
    return {
      site: "instagram",
      url: `https://www.instagram.com/${media.kind}/${media.shortcode}/`,
    };
  }
  const tikTok = tikTokPostUrl(item.url);
  if (tikTok !== undefined) return { site: "tiktok", url: tikTok };
  const video = youtubeVideoId(item.url);
  if (video !== undefined) {
    return { site: "youtube", url: `https://youtu.be/${video}` };
  }
  return undefined;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function savePins(
  item: Doc<"items">,
  city: string,
  visited: (pin: Placed) => boolean,
): PublicPin[] {
  const post = publicPost(item);
  return pinsForCity(item, city)
    .filter(
      (pin) => !isStreetAddress(pin.name) && !isGenericPlaceName(pin.name),
    )
    .map((pin) => ({
      name: pin.name,
      lat: pin.lat,
      lng: pin.lng,
      ...(pin.appleId !== undefined ? { appleId: pin.appleId } : {}),
      ...(pin.category !== undefined ? { category: pin.category } : {}),
      ...(pin.cuisine !== undefined ? { cuisine: pin.cuisine } : {}),
      kinds: placeKinds(pin.category, item.tags, pin.cuisine),
      went: visited(pin),
      ...(post !== undefined ? { post } : {}),
    }));
}

function mergePins(kept: PublicPin, repeat: PublicPin): PublicPin {
  const post = kept.post ?? repeat.post;
  return {
    ...mergeVenueKinds(kept, repeat),
    went: kept.went || repeat.went,
    ...(post !== undefined ? { post } : {}),
  };
}

function publicPlace(pin: PublicPin): PublicPlace {
  const emoji = placeEmoji({
    name: pin.name,
    category: pin.category,
    cuisine: pin.cuisine,
    kinds: pin.kinds,
  });
  return {
    name: pin.name,
    lat: round3(pin.lat),
    lng: round3(pin.lng),
    ...(emoji !== undefined ? { emoji } : {}),
    went: pin.went,
    ...(pin.post !== undefined ? { post: pin.post } : {}),
  };
}

export function publicCityPlaces(
  saves: readonly Doc<"items">[],
  city: string,
  visits: readonly VisitMark[],
): PublicPlace[] {
  const wanted = cityKey(city);
  if (wanted === "") return [];
  const visited = visitAtPin(visits);
  const pins = saves
    .filter(
      (item) =>
        item.type === "link" &&
        (item.cities ?? []).some((name) => cityKey(name) === wanted),
    )
    .slice(0, MAX_PUBLIC_MAP_SAVES_PER_CITY)
    .flatMap((item) => savePins(item, city, visited));
  const places = uniquePlacePins(pins, mergePins).map(publicPlace);
  return [
    ...places.filter((place) => place.went),
    ...places.filter((place) => !place.went),
  ].slice(0, MAX_PUBLIC_MAP_PLACES_PER_CITY);
}

function byPlaceCount<T extends { city: string; places: unknown[] }>(
  cities: T[],
): T[] {
  return cities
    .filter((entry) => entry.places.length > 0)
    .sort(
      (a, b) =>
        b.places.length - a.places.length || a.city.localeCompare(b.city),
    );
}

export function publicMapCities(
  saves: readonly Doc<"items">[],
  cities: readonly string[],
  visits: readonly VisitMark[],
): PublicCity[] {
  return byPlaceCount(
    cities.slice(0, MAX_PUBLIC_MAP_CITIES).map((city) => ({
      city,
      places: publicCityPlaces(saves, city, visits),
    })),
  );
}

export function publicCityPreviews(
  saves: readonly Doc<"items">[],
  visits: readonly VisitMark[],
): PublicCityPreview[] {
  return byPlaceCount(
    countCities([...saves]).map(({ city }) => ({
      city,
      places: publicCityPlaces(saves, city, visits).map(({ name, went }) => ({
        name,
        went,
      })),
    })),
  );
}
