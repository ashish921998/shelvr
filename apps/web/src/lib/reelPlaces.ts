// What the reel place finder shows. The server answer is untrusted text, so
// every field is length-capped and checked before it reaches the page.
export type ReelPlace = { name: string; city?: string };

export type ReelPlaces = {
  places: ReelPlace[];
  /** The city most of the places share, for the heading. */
  city?: string;
};

const MAX_PLACES = 30;

// Mirrors convex/model/externalUrl.ts (`instagramMedia`, `isTikTokUrl`), so a link
// the browser accepts is one the backend can read.
const INSTAGRAM_HOSTS = new Set([
  "instagram.com",
  "www.instagram.com",
  "m.instagram.com",
  "instagr.am",
  "www.instagr.am",
]);
const INSTAGRAM_MEDIA_PATH =
  /^\/(?:[A-Za-z0-9._]+\/)?(reels?|p|tv)\/([A-Za-z0-9_-]+)(?:\/.*)?$/;

/** The link as the visitor pasted it, when it is an Instagram or TikTok page. */
export function parseReelLink(raw: string): string | undefined {
  const text = raw.trim();
  if (!text || text.length > 500) return undefined;
  const withScheme = /^https?:\/\//i.test(text) ? text : `https://${text}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
  const host = url.hostname.toLowerCase();
  const tiktok = host === "tiktok.com" || host.endsWith(".tiktok.com");
  const match = url.pathname.match(INSTAGRAM_MEDIA_PATH);
  const instagram =
    INSTAGRAM_HOSTS.has(host) && match !== null && match[2] !== "audio";
  return tiktok || instagram ? url.toString() : undefined;
}

function cleanText(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.replace(/\s+/g, " ").trim();
  return text ? text.slice(0, max) : undefined;
}

export function parseReelPlaces(body: unknown): ReelPlaces | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const raw = (body as { places?: unknown }).places;
  if (!Array.isArray(raw)) return undefined;
  const places: ReelPlace[] = [];
  for (const entry of raw.slice(0, MAX_PLACES)) {
    if (typeof entry !== "object" || entry === null) continue;
    const name = cleanText((entry as { name?: unknown }).name, 120);
    if (!name) continue;
    const city = cleanText((entry as { city?: unknown }).city, 80);
    places.push(city ? { name, city } : { name });
  }
  const city = cleanText((body as { city?: unknown }).city, 80);
  return { places, ...(city ? { city } : {}) };
}

function searchText(place: ReelPlace): string {
  return place.city ? `${place.name}, ${place.city}` : place.name;
}

export function appleMapsUrl(place: ReelPlace): string {
  return `https://maps.apple.com/?q=${encodeURIComponent(searchText(place))}`;
}

export function googleMapsUrl(place: ReelPlace): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(searchText(place))}`;
}

// "Try a sample" for a visitor without a link to hand. Made up, with no
// creator named.
export const SAMPLE_PLACES: ReelPlaces = {
  city: "Lisbon",
  places: [
    { name: "Time Out Market", city: "Lisbon" },
    { name: "Pastéis de Belém", city: "Lisbon" },
    { name: "Manteigaria", city: "Lisbon" },
    { name: "Miradouro da Senhora do Monte", city: "Lisbon" },
    { name: "LX Factory", city: "Lisbon" },
  ],
};
