const MAX_SEARCH_NOTE_CHARS = 8000;

const MAX_SEARCH_CONTENT_CHARS = 8000;

export function buildSearchText(parts: {
  title?: string;
  description?: string;
  tags: string[];
  siteName?: string;
  note?: string;
  content?: string;
}): string {
  return [
    parts.title,
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
