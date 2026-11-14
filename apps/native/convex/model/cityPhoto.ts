import { tidyCity } from "./trip";

export const CITY_PHOTO_WIDTH = 960;
export const CITY_PHOTO_RETRY_MS = 24 * 60 * 60 * 1000;
export const CITY_PHOTO_MISSING_RETRY_MS = 30 * 24 * 60 * 60 * 1000;

const NOT_A_PLACE =
  /\b(film|movie|album|song|band|novel|television|tv series|video game|surname|given name|company|software|musical|magazine|newspaper|character)\b/i;

const NOT_A_VIEW =
  /(\.svg|montage|collage|composite|mosaic|flag|coat[ _]of[ _]arms|seal[ _]of|emblem|logo|locator|location[ _]map|map[ _]of|_map\b|\bmap_|signature|banner)/i;

const PHOTO_FILE = /\.(jpe?g|png)$/i;

export type WikiSummary = {
  type?: string;
  title?: string;
  description?: string;
  wikibaseItem?: string;
  thumbnail?: string;
};

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

export function summaryTitle(city: string): string {
  return encodeURIComponent(tidyCity(city).replace(/ /g, "_"));
}

export function parseSummary(body: unknown): WikiSummary | null {
  const data = record(body);
  if (data === undefined) return null;
  return {
    type: str(data.type),
    title: str(data.title),
    description: str(data.description),
    wikibaseItem: str(data.wikibase_item),
    thumbnail: str(record(data.thumbnail)?.source),
  };
}

export function isPlacePage(summary: WikiSummary): boolean {
  if (summary.type !== "standard") return false;
  return !NOT_A_PLACE.test(summary.description ?? "");
}

export function parseImageClaim(body: unknown): string | undefined {
  const claims = record(record(body)?.claims)?.P18;
  if (!Array.isArray(claims)) return undefined;
  for (const claim of claims) {
    const value = str(
      record(record(record(claim)?.mainsnak)?.datavalue)?.value,
    );
    if (value !== undefined && isPhotoFile(value)) return value;
  }
  return undefined;
}

export function isPhotoFile(file: string): boolean {
  return PHOTO_FILE.test(file) && !NOT_A_VIEW.test(file.replace(/ /g, "_"));
}

export function commonsThumbUrl(file: string, md5Hex: string): string {
  const name = file.replace(/ /g, "_");
  const encoded = encodeURIComponent(name);
  return `https://upload.wikimedia.org/wikipedia/commons/thumb/${md5Hex[0]}/${md5Hex.slice(0, 2)}/${encoded}/${CITY_PHOTO_WIDTH}px-${encoded}`;
}

export function widenedThumbnail(url: string | undefined): string | undefined {
  if (url === undefined) return undefined;
  const match = /\/(\d+)px-([^/]+)$/.exec(url);
  if (match === null) return undefined;
  const file = decodeURIComponent(match[2]);
  if (!isPhotoFile(file)) return undefined;
  return url.replace(/\/\d+px-([^/]+)$/, `/${CITY_PHOTO_WIDTH}px-$1`);
}

export type CityPhotoRow = {
  status: "pending" | "found" | "missing" | "failed";
  checkedAt: number;
};

export function shouldLookUp(row: CityPhotoRow | null, now: number): boolean {
  if (row === null) return true;
  if (row.status === "found") return false;
  if (row.status === "missing") {
    return now - row.checkedAt > CITY_PHOTO_MISSING_RETRY_MS;
  }
  return now - row.checkedAt > CITY_PHOTO_RETRY_MS;
}
