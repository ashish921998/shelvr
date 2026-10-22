"use node";

import {
  safeFetch,
  parseJson,
  PageFetchError,
  SHELVR_USER_AGENT,
  postField,
  type PageData,
} from "../pageReadCore";

function tikTokPostUrl(
  handle: string | undefined,
  videoId: string | undefined,
): string | undefined {
  return handle &&
    videoId &&
    /^[A-Za-z0-9._]+$/.test(handle) &&
    /^\d+$/.test(videoId)
    ? `https://www.tiktok.com/@${handle}/video/${videoId}`
    : undefined;
}

/** TikTok refuses bot page loads; oEmbed answers. It returns 400 for unsupported URLs, so only 404/410 mean gone. */
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
    ...postField(tikTokPostUrl(handle, str("embed_product_id"))),
    // Like Instagram's: the caption's first line, not its hashtags and paragraphs.
    title:
      Array.from(caption?.split("\n")[0] ?? "")
        .slice(0, 100)
        .join("") || undefined,
    siteName: "TikTok",
    author: handle ? `@${handle}` : str("author_name"),
    heroImageUrl: str("thumbnail_url"),
    heroAspectRatio: width > 0 && height > 0 ? width / height : 9 / 16,
    content: caption,
  };
}
