"use node";

import {
  z,
  env,
  safeFetch,
  parseJson,
  SHELVR_USER_AGENT,
  fetchPage,
  fetchErrorCategory,
  withLinkedRecipe,
  logEvent,
  type PageData,
} from "../pageReadCore";
import { youtubeVideoId } from "../externalUrl";

/** oEmbed statuses that mean "not a video it will describe", not a hiccup. */
const OEMBED_REFUSALS = new Set([400, 401, 403, 404]);

/**
 * YouTube often answers a server's page load with a consent or bot-check page,
 * so the save came back as a bare "YouTube Video" with no picture. Its public
 * oEmbed endpoint answers with the title, channel, and thumbnail. A link
 * oEmbed refuses (a channel page, a private or embed-blocked video) falls back
 * to the plain page read, so nothing is marked gone on oEmbed's word alone.
 * After a transient oEmbed failure the page read is marked incomplete, so the
 * save can be retried for the real title and thumbnail.
 */
export async function fetchYouTubeOEmbed(url: string): Promise<PageData> {
  const endpoint = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`;
  const result = await safeFetch(endpoint, {
    timeoutMs: 15000,
    maxBytes: 64 * 1024,
    allowContentType: (ct) => ct.startsWith("application/json"),
    headers: { "User-Agent": SHELVR_USER_AGENT, Accept: "application/json" },
  });
  let data: Record<string, unknown> | undefined;
  if (result.ok) {
    try {
      const parsed: unknown = parseJson(result.bytes);
      if (typeof parsed === "object" && parsed !== null) {
        data = parsed as Record<string, unknown>;
      }
    } catch {
      // Unreadable answer; read the page instead.
    }
  }
  const str = (key: string) => {
    const value = data?.[key];
    return typeof value === "string" && value !== "" ? value : undefined;
  };
  const title = str("title");
  if (!title) {
    if (!result.ok && OEMBED_REFUSALS.has(result.status ?? 0)) {
      return await fetchPage(url);
    }
    logEvent("warn", "youtube_oembed_failed", {
      error_category: result.ok ? "unreadable" : result.code,
    });
    return { ...(await fetchPage(url)), incomplete: true };
  }
  const width = Number(data?.thumbnail_width);
  const height = Number(data?.thumbnail_height);
  return {
    title,
    siteName: "YouTube",
    author: str("author_name"),
    heroImageUrl: str("thumbnail_url"),
    heroAspectRatio: width > 0 && height > 0 ? width / height : undefined,
  };
}

const youtubeSnippetSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      snippet: z.object({
        title: z.string().trim().min(1),
        channelTitle: z.string().optional(),
        description: z.string().optional(),
        thumbnails: z
          .record(
            z.string(),
            z.object({
              url: z.string().url(),
              width: z.number().positive().finite().optional(),
              height: z.number().positive().finite().optional(),
            }),
          )
          .optional(),
      }),
    }),
  ),
});

function parseYouTubeVideo(body: unknown, id: string): PageData | undefined {
  const data = youtubeSnippetSchema.safeParse(body);
  const snippet = data.success
    ? data.data.items.find((item) => item.id === id)?.snippet
    : undefined;
  if (!snippet) return undefined;
  const thumbnail = Object.values(snippet.thumbnails ?? {}).sort(
    (a, b) => (b.width ?? 0) - (a.width ?? 0),
  )[0];
  return {
    title: snippet.title,
    author: snippet.channelTitle,
    siteName: "YouTube",
    heroImageUrl: thumbnail?.url,
    heroAspectRatio:
      thumbnail?.width && thumbnail.height
        ? thumbnail.width / thumbnail.height
        : undefined,
    content: snippet.description?.trim() || undefined,
    caption: true,
  };
}

/** Optional description read; every failure preserves the existing oEmbed path. */
export async function fetchYouTube(url: string): Promise<PageData> {
  const key = env.YOUTUBE_API_KEY;
  const id = youtubeVideoId(url);
  if (!key || !id) return fetchYouTubeOEmbed(url);
  const endpoint = new URL("https://www.googleapis.com/youtube/v3/videos");
  endpoint.search = new URLSearchParams({
    part: "snippet",
    id,
    key,
  }).toString();
  let read: PageData | undefined;
  let errorCategory = "unreadable_video";
  try {
    const result = await safeFetch(endpoint.toString(), {
      timeoutMs: 15000,
      maxBytes: 64 * 1024,
      allowContentType: (ct) => ct.startsWith("application/json"),
      headers: { "User-Agent": SHELVR_USER_AGENT, Accept: "application/json" },
    });
    if (!result.ok) {
      errorCategory = `page_fetch_error:${result.code}`;
    } else if (!result.truncated) {
      read = parseYouTubeVideo(parseJson(result.bytes), id);
    }
  } catch (error) {
    errorCategory = fetchErrorCategory(error);
  }
  if (read) return withLinkedRecipe(read);
  logEvent("warn", "youtube_data_api_fallback", {
    error_category: errorCategory,
  });
  return fetchYouTubeOEmbed(url);
}
