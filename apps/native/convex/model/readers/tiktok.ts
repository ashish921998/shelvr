"use node";

import {
  safeFetch,
  parseJson,
  PageFetchError,
  SHELVR_USER_AGENT,
  type PageData,
} from "../pageReadCore";

/**
 * TikTok refuses bot page loads, but its public oEmbed endpoint answers with
 * the caption, creator, and a 9:16 poster — everything the card needs. TikTok
 * also returns 400 for unsupported URL shapes, so only true 404/410 responses
 * are treated as permanently gone by the shared page reader.
 */
export async function fetchTikTokOEmbed(url: string): Promise<PageData> {
  const endpoint = `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`;
  const result = await safeFetch(endpoint, {
    timeoutMs: 15000,
    maxBytes: 64 * 1024,
    allowContentType: (ct) => ct.startsWith("application/json"),
    headers: { "User-Agent": SHELVR_USER_AGENT, Accept: "application/json" },
  });
  if (!result.ok) {
    throw new PageFetchError(result.code, result.status);
  }
  const data = parseJson(result.bytes) as Record<string, unknown>;
  const str = (key: string) => {
    const value = data[key];
    return typeof value === "string" && value !== "" ? value : undefined;
  };
  const width = Number(data.thumbnail_width);
  const height = Number(data.thumbnail_height);
  const handle = str("author_unique_id");
  const caption = str("title");
  return {
    title: caption,
    siteName: "TikTok",
    author: handle ? `@${handle}` : str("author_name"),
    heroImageUrl: str("thumbnail_url"),
    heroAspectRatio: width > 0 && height > 0 ? width / height : 9 / 16,
    content: caption,
  };
}
