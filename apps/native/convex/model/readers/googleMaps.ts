"use node";

import {
  safeFetch,
  decodeWithContentType,
  PageFetchError,
  PAGE_FETCH_OPTIONS,
  logEvent,
  type PageData,
} from "../pageReadCore";
import {
  MAX_LIST_PLACES,
  placeListContent,
  type ListedPlace,
} from "../placeList";

const LIST_ID = /^[\w-]{10,64}$/;
const MAX_LIST_BYTES = 2 * 1024 * 1024;
const MAX_NAME_CHARS = 120;
const MAX_TEXT_CHARS = 500;
// Google answers a full browser user agent on its short links with a script page instead of the redirect.
const SHORT_LINK_USER_AGENT = "Mozilla/5.0";

/** The id of a shared list in a Google Maps URL or page, or undefined when it names no list. */
export function googleMapsListId(text: string): string | undefined {
  let decoded = text;
  try {
    decoded = decodeURIComponent(text);
  } catch {
    // Keep the raw text: a stray % only means it was not encoded.
  }
  const id =
    decoded.match(/\/placelists\/list\/([\w-]+)/)?.[1] ??
    decoded.match(/!11m\d+!2s([\w-]+)/)?.[1];
  return id !== undefined && LIST_ID.test(id) ? id : undefined;
}

function listEndpoint(id: string): string {
  return `https://www.google.com/maps/preview/entitylist/getlist?authuser=0&hl=en&gl=us&pb=!1m4!1s${id}!2e1!3m1!1e1!2e2!3e2!4i500!16b1`;
}

function at(value: unknown, ...path: number[]): unknown {
  let current = value;
  for (const index of path) {
    if (!Array.isArray(current)) return undefined;
    current = current[index];
  }
  return current;
}

function text(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed === "" ? undefined : trimmed.slice(0, max);
}

function coordinate(value: unknown, limit: number): number | undefined {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    Math.abs(value) <= limit
    ? value
    : undefined;
}

function listedPlace(entry: unknown): ListedPlace | undefined {
  const name = text(at(entry, 2), MAX_NAME_CHARS);
  if (name === undefined) return undefined;
  const address = text(at(entry, 1, 4), MAX_TEXT_CHARS);
  const note = text(at(entry, 3), MAX_TEXT_CHARS);
  const lat = coordinate(at(entry, 1, 5, 2), 90);
  const lng = coordinate(at(entry, 1, 5, 3), 180);
  return {
    name,
    ...(address ? { address } : {}),
    ...(note ? { note } : {}),
    ...(lat !== undefined && lng !== undefined ? { lat, lng } : {}),
  };
}

export type GoogleMapsList = {
  title?: string;
  description?: string;
  author?: string;
  places: ListedPlace[];
};

/**
 * Reads the body Google's list endpoint answers with: the list, "missing" when Google says it holds
 * no list it will show (private or deleted), or undefined for anything it does not recognize.
 */
export function parseGoogleMapsList(
  body: string,
): GoogleMapsList | "missing" | undefined {
  let data: unknown;
  try {
    data = JSON.parse(body.replace(/^\)\]\}'\s*/, ""));
  } catch {
    return undefined;
  }
  const list = at(data, 0);
  if (list === null && Array.isArray(at(data, 2))) return "missing";
  const entries = at(list, 8) ?? [];
  if (!Array.isArray(list) || !Array.isArray(entries)) return undefined;
  const places = entries
    .map(listedPlace)
    .filter((place) => place !== undefined)
    .slice(0, MAX_LIST_PLACES);
  const title = text(at(list, 4), MAX_NAME_CHARS);
  const description = text(at(list, 5), MAX_TEXT_CHARS);
  const author = text(at(list, 3, 0), MAX_NAME_CHARS);
  return {
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    ...(author ? { author } : {}),
    places,
  };
}

/** A short link only says which list it is once followed; Google may also put the target in the page it serves. */
async function resolveListId(url: string): Promise<string | undefined> {
  const direct = googleMapsListId(url);
  if (direct !== undefined) return direct;
  const host = new URL(url).hostname.toLowerCase();
  if (host !== "maps.app.goo.gl" && host !== "goo.gl") return undefined;
  const result = await safeFetch(url, {
    ...PAGE_FETCH_OPTIONS,
    maxBytes: 256 * 1024,
    maxRedirects: 5,
    headers: {
      ...PAGE_FETCH_OPTIONS.headers,
      "User-Agent": SHORT_LINK_USER_AGENT,
    },
  });
  if (!result.ok) {
    throw new PageFetchError(result.code, result.status);
  }
  const landed = googleMapsListId(result.finalUrl);
  if (landed !== undefined) return landed;
  // Only a page still on the short-link host is Google's stand-in for the redirect; a place page names other lists.
  return new URL(result.finalUrl).hostname.toLowerCase() === host
    ? googleMapsListId(decodeWithContentType(result.bytes, result.contentType))
    : undefined;
}

/**
 * A shared Google Maps list as a page: its title, owner and places with their notes, addresses and points.
 * Undefined when the link is not a list (a single place, directions) or Google's answer is not one this
 * reader recognizes, so the caller reads it as a page.
 * A list Google no longer shows, private or deleted, reads as gone.
 */
export async function fetchGoogleMapsList(
  url: string,
): Promise<PageData | undefined> {
  const id = await resolveListId(url);
  if (id === undefined) return undefined;
  const result = await safeFetch(listEndpoint(id), {
    timeoutMs: 15000,
    maxBytes: MAX_LIST_BYTES,
    headers: {
      "User-Agent": SHORT_LINK_USER_AGENT,
      Accept: "*/*",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  if (!result.ok) {
    throw new PageFetchError(result.code, result.status);
  }
  const list = parseGoogleMapsList(
    decodeWithContentType(result.bytes, result.contentType),
  );
  if (list === "missing") {
    logEvent("info", "google_maps_list_missing", {});
    throw new PageFetchError("http_error", 404);
  }
  if (list === undefined) {
    // A changed format or a consent page: read the link as a plain page instead.
    logEvent("warn", "google_maps_list_unrecognized", {});
    return undefined;
  }
  logEvent("info", "google_maps_list_read", { count: list.places.length });
  return {
    ...(list.title ? { title: list.title } : {}),
    ...(list.description ? { description: list.description } : {}),
    ...(list.author ? { author: list.author } : {}),
    siteName: "Google Maps",
    ...(list.places.length > 0
      ? {
          content: placeListContent(list.places),
          placeList: list.places,
        }
      : {}),
  };
}
