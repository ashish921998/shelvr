const MAX_SEARCH_NOTE_CHARS = 8000;

const MAX_SEARCH_CONTENT_CHARS = 8000;

/** Convex tokenizes punctuation too and accepts at most 16 search terms. */
export function searchQueryText(query: string): string {
  return (query.toLowerCase().match(/[\p{Alphabetic}\p{Number}]+/gu) ?? [])
    .slice(0, 16)
    .join(" ");
}

export function buildSearchText(parts: {
  title?: string;
  description?: string;
  tags: string[];
  siteName?: string;
  note?: string;
  content?: string;
  cities?: string[];
  places?: string[];
  placePins?: { name: string }[];
}): string {
  return [
    parts.title,
    ...(parts.cities ?? []),
    ...(parts.places ?? []),
    ...(parts.placePins ?? []).map((pin) => pin.name),
    parts.description,
    ...parts.tags,
    parts.siteName,
    parts.note?.slice(0, MAX_SEARCH_NOTE_CHARS),
    parts.content?.slice(0, MAX_SEARCH_CONTENT_CHARS),
  ]
    .filter((p): p is string => typeof p === "string" && p.length > 0)
    .join(" ")
    .toLowerCase();
}
