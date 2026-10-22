"use node";

import {
  safeFetch,
  decodeWithContentType,
  PageFetchError,
  SHELVR_USER_AGENT,
  MAX_STORED_CONTENT_CHARS,
  decodeEntities,
  extractCanonical,
  extractMetaContent,
  fetchImageAspectRatio,
  fetchErrorCategory,
  isTransientFetchFailure,
  logEvent,
  postField,
  type PageData,
} from "../pageReadCore";
import { instagramMedia } from "../externalUrl";

type InstagramEmbedFields = {
  caption?: string;
  username?: string;
  posterUrl?: string;
  brokenMedia?: true;
};

export function parseInstagramEmbed(html: string): InstagramEmbedFields {
  const block = html.match(
    /<div class="Caption">([\s\S]*?)<div class="CaptionComments">/i,
  )?.[1];
  const username = block
    ?.match(/<a[^>]*class="CaptionUsername"[^>]*>([^<]*)<\/a>/i)?.[1]
    ?.trim();
  const caption = block
    ? decodeEntities(
        block
          .replace(/<a[^>]*class="CaptionUsername"[^>]*>[^<]*<\/a>/i, "")
          .replace(/<br\s*\/?>/gi, "\n")
          .replace(/<[^>]+>/g, "")
          .replace(/</g, ""),
      )
        .split("\n")
        .map((line) => line.replace(/[ \t]+/g, " ").trim())
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim()
    : undefined;
  const img = html.match(/<img[^>]*class="EmbeddedMediaImage"[^>]*>/i)?.[0];
  const src = img?.match(/\ssrc="([^"]+)"/i)?.[1];
  return {
    caption: caption || undefined,
    username: username ? decodeEntities(username) : undefined,
    posterUrl: src ? decodeEntities(src) : undefined,
    ...(/class="[^"]*\bEmbedBrokenMedia\b/.test(html)
      ? { brokenMedia: true as const }
      : {}),
  };
}

async function fetchInstagramHtml(url: string) {
  return await safeFetch(url, {
    timeoutMs: 15000,
    maxBytes: 1024 * 1024,
    onOverflow: "truncate",
    allowContentType: (ct) => ct.startsWith("text/html"),
    headers: {
      "User-Agent": SHELVR_USER_AGENT,
      Accept: "text/html",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
}

type InstagramEmbed =
  | { status: "ok"; html: string; truncated?: true }
  | { status: "missing" }
  | { status: "transient"; errorCategory: string };

async function fetchInstagramEmbed(url: string): Promise<InstagramEmbed> {
  let result: Awaited<ReturnType<typeof fetchInstagramHtml>>;
  try {
    result = await fetchInstagramHtml(url);
  } catch (error) {
    return { status: "transient", errorCategory: fetchErrorCategory(error) };
  }
  if (result.ok) {
    return {
      status: "ok",
      html: decodeWithContentType(result.bytes, result.contentType),
      ...(result.truncated ? { truncated: true as const } : {}),
    };
  }
  return isTransientFetchFailure(result.code, result.status)
    ? { status: "transient", errorCategory: `page_fetch_error:${result.code}` }
    : { status: "missing" };
}

type InstagramCard = {
  title?: string;
  image?: string;
  description?: string;
  video?: true;
};

function instagramCard(html: string): InstagramCard | undefined {
  const title = [
    extractMetaContent(html, "twitter:title"),
    extractMetaContent(html, "og:title"),
  ].find((candidate) => candidate !== undefined && candidate !== "Instagram");
  const image =
    extractMetaContent(html, "og:image") ??
    extractMetaContent(html, "twitter:image");
  if (title === undefined && image === undefined) {
    return undefined;
  }
  return {
    title,
    image,
    description: extractMetaContent(html, "og:description"),
    video: /•\s*Instagram (?:video|reel)\b/i.test(title ?? "")
      ? true
      : undefined,
  };
}

type InstagramPost = { kind: "reel" | "p" | "tv"; shortcode: string };

type InstagramMedia = ReturnType<typeof instagramMedia>;

function isInstagramPost(media: InstagramMedia): media is InstagramPost {
  return media?.shortcode !== undefined;
}

function instagramPostUrl(post: InstagramPost): string {
  return `https://www.instagram.com/${post.kind}/${post.shortcode}/`;
}

async function fetchInstagramPost(url: string) {
  const linked = instagramMedia(url);
  const direct = isInstagramPost(linked) ? linked : undefined;
  const embedFor = (post: InstagramPost | undefined) =>
    post
      ? fetchInstagramEmbed(`${instagramPostUrl(post)}embed/captioned/`)
      : Promise.resolve<InstagramEmbed>({ status: "missing" });
  const [page, directEmbed] = await Promise.all([
    fetchInstagramHtml(direct ? instagramPostUrl(direct) : url),
    direct ? embedFor(direct) : Promise.resolve(undefined),
  ]);
  if (!page.ok) {
    throw new PageFetchError(page.code, page.status);
  }
  const html = decodeWithContentType(page.bytes, page.contentType);
  const post =
    direct ??
    [page.finalUrl, extractMetaContent(html, "og:url"), extractCanonical(html)]
      .map((candidate) => instagramMedia(candidate, page.finalUrl))
      .find(isInstagramPost);
  const embed = directEmbed ?? (await embedFor(post));
  if (embed.status === "transient") {
    logEvent("warn", "instagram_caption_fetch_failed", {
      error_category: embed.errorCategory,
    });
  }
  return {
    page,
    html,
    kind: (post ?? linked)?.kind,
    embed,
    postUrl: post && instagramPostUrl(post),
  };
}

export async function fetchInstagram(url: string): Promise<PageData> {
  const { page, html, kind, embed, postUrl } = await fetchInstagramPost(url);
  const embedded: InstagramEmbedFields =
    embed.status === "ok" ? parseInstagramEmbed(embed.html) : {};
  const card = instagramCard(html);
  const truncated =
    page.truncated === true || (embed.status === "ok" && embed.truncated);
  // Instagram answers 200 for a deleted post; "gone" is no post data plus the embed's broken-media box.
  const readNothing =
    card === undefined &&
    embedded.caption === undefined &&
    embedded.posterUrl === undefined;
  if (readNothing && embedded.brokenMedia === true && !truncated) {
    throw new PageFetchError("http_error", 404);
  }
  const cardTitle = card?.title;
  const handle =
    embedded.username ?? cardTitle?.match(/\(@([A-Za-z0-9._]+)\)/)?.[1];
  const heroImageUrl = embedded.posterUrl ?? card?.image;
  const caption = embedded.caption?.slice(0, MAX_STORED_CONTENT_CHARS);
  const heroAspectRatio = heroImageUrl
    ? ((await fetchImageAspectRatio(heroImageUrl)) ??
      (kind === "p" ? 1 : 9 / 16))
    : undefined;
  return {
    ...postField(postUrl),
    title:
      Array.from(caption?.split("\n")[0] ?? "")
        .slice(0, 100)
        .join("") || cardTitle,
    description: caption ? cardTitle : card?.description,
    siteName: "Instagram",
    author: handle ? `@${handle}` : undefined,
    heroImageUrl,
    heroAspectRatio,
    content: caption,
    video: card?.video,
    ...(truncated ? { truncated: true as const } : {}),
    ...(embed.status === "transient" || (readNothing && truncated)
      ? { incomplete: true as const }
      : {}),
  };
}
