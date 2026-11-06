import type { Metadata } from "next";
import { headers } from "next/headers";
import { cache } from "react";

import {
  WAITLIST_CLIENT_IP_HEADER,
  WAITLIST_SECRET_HEADER,
  clientIpFromHeaders,
} from "@/lib/convexForward";
import { convexSiteUrl } from "@/lib/convexSiteUrl";
import { serverLog } from "@/lib/serverLog";

type PostSite = "instagram" | "tiktok" | "youtube";

export type PublicMapPlace = {
  name: string;
  lat: number;
  lng: number;
  emoji?: string;
  went: boolean;
  post?: { site: PostSite; url: string };
};

export type PublicMap = {
  ownerName?: string;
  cities: { city: string; places: PublicMapPlace[] }[];
  saveAll: boolean;
};

export type PublicMapOutcome = "found" | "missing" | "unavailable";

export type PublicMapCounts = { cities: number; places: number; been: number };

const MAX_CITIES = 12;
const MAX_PLACES_PER_CITY = 100;
const MAX_NAME_CHARS = 120;
const MAX_CITY_CHARS = 80;
const MAX_EMOJI_CHARS = 16;
const MAX_OWNER_CHARS = 40;
const MAX_POST_URL_CHARS = 300;
const FETCH_TIMEOUT_MS = 10_000;
const LISTED_CITIES = 3;

const POST_ORIGINS: Record<PostSite, string> = {
  instagram: "https://www.instagram.com/",
  tiktok: "https://www.tiktok.com/@",
  youtube: "https://youtu.be/",
};

const POST_LABELS: Record<PostSite, string> = {
  instagram: "See on Instagram",
  tiktok: "Watch on TikTok",
  youtube: "Watch on YouTube",
};

const PRINTABLE_URL = /^[\x21-\x7e]+$/;

function cleanText(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const chars = Array.from(value.replace(/\s+/g, " ").trim());
  const text = chars.slice(0, max).join("").trim();
  return text || undefined;
}

function coordinate(value: unknown, limit: number): number | undefined {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    Math.abs(value) <= limit
    ? value
    : undefined;
}

function isPostSite(value: unknown): value is PostSite {
  return value === "instagram" || value === "tiktok" || value === "youtube";
}

function parsePost(value: unknown): PublicMapPlace["post"] {
  if (typeof value !== "object" || value === null) return undefined;
  const { site, url } = value as { site?: unknown; url?: unknown };
  if (!isPostSite(site) || typeof url !== "string") return undefined;
  return url.length <= MAX_POST_URL_CHARS &&
    PRINTABLE_URL.test(url) &&
    url.startsWith(POST_ORIGINS[site])
    ? { site, url }
    : undefined;
}

function parsePlace(value: unknown): PublicMapPlace | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const raw = value as Record<string, unknown>;
  const name = cleanText(raw.name, MAX_NAME_CHARS);
  const lat = coordinate(raw.lat, 90);
  const lng = coordinate(raw.lng, 180);
  if (
    name === undefined ||
    lat === undefined ||
    lng === undefined ||
    typeof raw.went !== "boolean"
  ) {
    return undefined;
  }
  const emoji = cleanText(raw.emoji, MAX_EMOJI_CHARS);
  const post = parsePost(raw.post);
  return {
    name,
    lat,
    lng,
    ...(emoji ? { emoji } : {}),
    went: raw.went,
    ...(post ? { post } : {}),
  };
}

function parseCity(value: unknown): PublicMap["cities"][number] | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const raw = value as { city?: unknown; places?: unknown };
  const city = cleanText(raw.city, MAX_CITY_CHARS);
  if (city === undefined || !Array.isArray(raw.places)) return undefined;
  const places = raw.places
    .slice(0, MAX_PLACES_PER_CITY)
    .flatMap((place) => parsePlace(place) ?? []);
  return places.length > 0 ? { city, places } : undefined;
}

export function parsePublicMap(body: unknown): PublicMap | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const raw = body as {
    ownerName?: unknown;
    cities?: unknown;
    saveAll?: unknown;
  };
  if (!Array.isArray(raw.cities)) return undefined;
  const cities = raw.cities
    .slice(0, MAX_CITIES)
    .flatMap((city) => parseCity(city) ?? []);
  const ownerName = cleanText(raw.ownerName, MAX_OWNER_CHARS);
  return {
    ...(ownerName ? { ownerName } : {}),
    cities,
    saveAll: raw.saveAll === true,
  };
}

export async function fetchPublicMap(
  token: string,
  ip: string | undefined,
): Promise<{ outcome: PublicMapOutcome; map?: PublicMap }> {
  const siteUrl = convexSiteUrl();
  const secret = process.env.WAITLIST_SHARED_SECRET;
  if (!siteUrl || !secret) {
    serverLog("error", "public_map_unconfigured", {
      has_site_url: siteUrl !== undefined,
      has_shared_secret: Boolean(secret),
    });
    return { outcome: "unavailable" };
  }

  try {
    const response = await fetch(
      `${siteUrl}/map/pages/${encodeURIComponent(token)}`,
      {
        cache: "no-store",
        headers: {
          [WAITLIST_SECRET_HEADER]: secret,
          ...(ip ? { [WAITLIST_CLIENT_IP_HEADER]: ip } : {}),
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      },
    );
    if (response.status === 404) return { outcome: "missing" };
    if (response.status === 429) {
      serverLog("warn", "public_map_limited", {});
      return { outcome: "unavailable" };
    }
    if (!response.ok) {
      serverLog("error", "public_map_failed", { status: response.status });
      return { outcome: "unavailable" };
    }
    const map = parsePublicMap(await response.json());
    if (!map) {
      serverLog("error", "public_map_failed", { status: 200 });
      return { outcome: "unavailable" };
    }
    return { outcome: "found", map };
  } catch (error) {
    serverLog("error", "public_map_failed", {
      error_name: error instanceof Error ? error.name : "unknown",
    });
    return { outcome: "unavailable" };
  }
}

export const loadPublicMap = cache(async (token: string) =>
  fetchPublicMap(token, clientIpFromHeaders(await headers())),
);

export function mapTitle(map?: PublicMap): string {
  return map?.ownerName ? `${map.ownerName}’s map` : "A Shelvr map";
}

export function mapCounts(map?: PublicMap): PublicMapCounts {
  const places = map?.cities.flatMap((city) => city.places) ?? [];
  return {
    cities: map?.cities.length ?? 0,
    places: places.length,
    been: places.filter((place) => place.went).length,
  };
}

export function countLabel(count: number, one: string, other: string): string {
  return `${count.toLocaleString("en-US")} ${count === 1 ? one : other}`;
}

export function cityList(cities: readonly string[]): string {
  if (cities.length <= 1) return cities[0] ?? "";
  if (cities.length > LISTED_CITIES) {
    const listed = cities.slice(0, LISTED_CITIES).join(", ");
    return `${listed} and ${cities.length - LISTED_CITIES} more`;
  }
  return `${cities.slice(0, -1).join(", ")} and ${cities[cities.length - 1]}`;
}

export function mapDescription(map?: PublicMap): string {
  if (!map) return "Places saved with Shelvr.";
  const counts = mapCounts(map);
  if (counts.places === 0) return "A map made with Shelvr.";
  const places = countLabel(counts.places, "place", "places");
  const been = counts.been > 0 ? `, ${counts.been} been there` : "";
  const cities = cityList(map.cities.map((city) => city.city));
  const closing = map.saveAll
    ? "Save them all to Shelvr."
    : "Made with Shelvr.";
  return `${cities}: ${places}${been}. ${closing}`;
}

export function placeLink(
  place: PublicMapPlace,
  city: string,
  android: boolean,
): { label: string; href: string } {
  if (place.post) {
    return { label: POST_LABELS[place.post.site], href: place.post.url };
  }
  const href = android
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place.name}, ${city}`)}`
    : `https://maps.apple.com/?q=${encodeURIComponent(place.name)}&ll=${place.lat},${place.lng}`;
  return { label: "Open in Maps", href };
}

export function mapMetadata(token: string, map?: PublicMap): Metadata {
  const title = mapTitle(map);
  const description = mapDescription(map);
  const path = `/m/${encodeURIComponent(token)}`;
  return {
    title: `${title} — Shelvr`,
    description,
    alternates: { canonical: path },
    robots: { index: false, follow: false },
    openGraph: {
      title,
      description,
      url: path,
      siteName: "Shelvr",
      type: "website",
    },
    twitter: { card: "summary", title, description },
  };
}
