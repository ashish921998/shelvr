"use node";

import {
  z,
  safeFetch,
  parseJson,
  PageFetchError,
  SHELVR_USER_AGENT,
  decodeEntities,
  firstLinkedUrl,
  logEvent,
  type PageData,
  type PostMedia,
} from "../pageReadCore";
import { xStatusId } from "../externalUrl";

/** oEmbed markup: `<blockquote><p>post text</p>&mdash; Author (@handle) <a>date</a></blockquote>`. */
export async function fetchXoEmbed(url: string): Promise<PageData> {
  const endpoint = `https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}&omit_script=true`;
  const result = await safeFetch(endpoint, {
    timeoutMs: 15000,
    maxBytes: 64 * 1024,
    allowContentType: (ct) => ct.startsWith("application/json"),
    headers: { "User-Agent": SHELVR_USER_AGENT, Accept: "application/json" },
  });
  if (!result.ok) {
    throw new PageFetchError(result.code, result.status);
  }
  let parsed: unknown;
  try {
    parsed = parseJson(result.bytes);
  } catch {
    throw new PageFetchError("http_error", result.status);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new PageFetchError("http_error", result.status);
  }
  const data = parsed as Record<string, unknown>;
  const str = (key: string) => {
    const value = data[key];
    return typeof value === "string" && value !== "" ? value : undefined;
  };
  const html = str("html") ?? "";
  const paragraph = html.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  const body = paragraph ? paragraph[1] : html;
  const content = decodeEntities(
    body
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
  // t.co anchors show the display URL; pic.twitter.com media links lead nowhere useful.
  const hrefs = Array.from(
    body.matchAll(/<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi),
  )
    .filter(([, , label]) => !/^\s*pic\.(twitter|x)\.com/i.test(label))
    .map(([, href]) => decodeEntities(href));
  const handle = str("author_url")?.match(
    /(?:twitter\.com|x\.com)\/([^/?#]+)/i,
  )?.[1];
  return {
    title: content.slice(0, 100) || undefined,
    siteName: "X",
    author: handle ? `@${handle}` : str("author_name"),
    content: content || undefined,
    linkedUrl: firstLinkedUrl(hrefs.join(" ")),
  };
}

const xDimensions = {
  width: z.number().positive(),
  height: z.number().positive(),
};

const xSyndicationSchema = z.object({
  text: z.string().optional(),
  user: z.object({ screen_name: z.string() }).optional(),
  possibly_sensitive: z.boolean().optional(),
  entities: z
    .object({
      urls: z
        .array(z.object({ url: z.string(), expanded_url: z.string() }))
        .optional(),
      media: z.array(z.object({ url: z.string() })).optional(),
    })
    .optional(),
  mediaDetails: z
    .array(
      z.object({
        type: z.string(),
        media_url_https: z.url(),
        original_info: z.object(xDimensions),
      }),
    )
    .optional(),
  note_tweet: z.object({}).optional(),
  article: z
    .object({
      title: z.string(),
      preview_text: z.string().optional(),
      cover_media: z
        .object({
          media_info: z.object({
            original_img_url: z.url(),
            original_img_width: xDimensions.width,
            original_img_height: xDimensions.height,
          }),
        })
        .optional(),
    })
    .optional(),
});

const X_MEDIA_KINDS: Partial<Record<string, PostMedia["kind"]>> = {
  photo: "photo",
  video: "video",
  animated_gif: "gif",
};

function xLargeImage(url: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set("name", "large");
  return parsed.toString();
}

function xPostText(
  post: z.infer<typeof xSyndicationSchema>,
): string | undefined {
  let text = decodeEntities(post.text ?? "");
  for (const link of post.entities?.urls ?? []) {
    text = text.replaceAll(link.url, link.expanded_url);
  }
  for (const attachment of post.entities?.media ?? []) {
    text = text.replaceAll(attachment.url, "");
  }
  text = text.trim();
  if (text === "") {
    return undefined;
  }
  return post.note_tweet ? `${text}…` : text;
}

function parseXSyndication(body: unknown): PageData | undefined {
  const parsed = xSyndicationSchema.safeParse(body);
  if (!parsed.success) {
    return undefined;
  }
  const post = parsed.data;
  const author = post.user ? `@${post.user.screen_name}` : undefined;
  // X hides sensitive media behind a warning; the feed and widget have none.
  const cover = post.possibly_sensitive
    ? undefined
    : post.article?.cover_media?.media_info;
  if (post.article) {
    // Syndication cuts the preview mid-sentence.
    const preview = post.article.preview_text?.trim();
    return {
      title: post.article.title,
      siteName: "X",
      author,
      content: preview ? `${preview}…` : undefined,
      ...(preview ? { truncated: true as const } : {}),
      heroImageUrl: cover ? xLargeImage(cover.original_img_url) : undefined,
      heroAspectRatio: cover
        ? cover.original_img_width / cover.original_img_height
        : undefined,
    };
  }
  const content = xPostText(post);
  const attachments = post.possibly_sensitive ? [] : (post.mediaDetails ?? []);
  const media = attachments.flatMap((attachment) => {
    const kind = X_MEDIA_KINDS[attachment.type];
    return kind
      ? [
          {
            kind,
            imageUrl: xLargeImage(attachment.media_url_https),
            aspectRatio:
              attachment.original_info.width / attachment.original_info.height,
          },
        ]
      : [];
  });
  if (content === undefined && media.length === 0) {
    return undefined;
  }
  return {
    title: content ? Array.from(content).slice(0, 100).join("") : undefined,
    siteName: "X",
    author,
    content,
    ...(post.note_tweet ? { truncated: true as const } : {}),
    ...(media.length > 0
      ? {
          heroImageUrl: media[0].imageUrl,
          heroAspectRatio: media[0].aspectRatio,
          media,
        }
      : {}),
  };
}

function xSyndicationToken(id: string): string {
  return ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, "");
}

export async function fetchXPost(url: string): Promise<PageData> {
  const id = xStatusId(url);
  if (id === undefined) {
    return await fetchXoEmbed(url);
  }
  const result = await safeFetch(
    `https://cdn.syndication.twimg.com/tweet-result?id=${id}&token=${xSyndicationToken(id)}`,
    {
      timeoutMs: 10000,
      maxBytes: 256 * 1024,
      allowContentType: (ct) => ct.startsWith("application/json"),
      headers: { "User-Agent": SHELVR_USER_AGENT, Accept: "application/json" },
    },
  );
  let read: PageData | undefined;
  if (result.ok) {
    try {
      read = parseXSyndication(parseJson(result.bytes));
    } catch {
      read = undefined;
    }
  }
  if (read) {
    return read;
  }
  logEvent("warn", "x_syndication_fallback", {
    error_category: result.ok
      ? "unreadable_post"
      : `page_fetch_error:${result.code}`,
  });
  return await fetchXoEmbed(url);
}
