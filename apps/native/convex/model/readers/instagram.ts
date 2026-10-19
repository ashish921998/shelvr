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

/**
 * Instagram's post page can carry a link-preview card: `twitter:title`
 * ("Name (@handle) • Instagram reel") and a square-cropped `og:image`. Its
 * captioned embed adds the caption and the uncropped poster. Shelvr asks as
 * itself, so Instagram may answer with its login shell instead and the save
 * keeps only its URL. Parsed apart from the fetch so it is testable.
 */
type InstagramEmbedFields = {
  caption?: string;
  username?: string;
  posterUrl?: string;
  /** The embed shows Instagram's "this post may have been removed" box. */
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
          // An unclosed "<script" survives the tag strip; drop its "<".
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
  /** The card calls the post a video or reel, whatever the URL says. */
  video?: true;
};

/** The link-preview card on Instagram's post page, or undefined for the
 * login shell, which titles itself just "Instagram" and names no post. */
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

/** An Instagram link whose shortcode is known: a direct link, or a share
 * link once its redirect named the post. */
type InstagramPost = { kind: "reel" | "p" | "tv"; shortcode: string };

type InstagramMedia = ReturnType<typeof instagramMedia>;

function isInstagramPost(media: InstagramMedia): media is InstagramPost {
  return media?.shortcode !== undefined;
}

/** The post's plain address. The `/reels/` alias sends the crawler to the
 * login page, so even a direct link is read here. */
function instagramPostUrl(post: InstagramPost): string {
  return `https://www.instagram.com/${post.kind}/${post.shortcode}/`;
}

/** Fetch a post's page and its captioned embed. A direct link reads both at
 * once; a share link only names its post after the page fetch follows the
 * redirect, so its embed waits for the page. */
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

/**
 * Read an Instagram post or reel. The page fetch decides gone/unreadable like
 * any link; the embed is best-effort. Shell markup is never article content:
 * the only content is the caption. A post Instagram calls broken is gone; any
 * other post it shares nothing about is a bare "Instagram" page that still
 * classifies from its URL. A transiently failed embed marks the read
 * incomplete so the save can retry.
 */
export async function fetchInstagram(url: string): Promise<PageData> {
  const { page, html, kind, embed, postUrl } = await fetchInstagramPost(url);
  const embedded: InstagramEmbedFields =
    embed.status === "ok" ? parseInstagramEmbed(embed.html) : {};
  const card = instagramCard(html);
  const truncated =
    page.truncated === true || (embed.status === "ok" && embed.truncated);
  // Instagram answers 200 for a deleted or made-up post. The only "gone"
  // signal is that nothing about the post was read and the embed shows its
  // broken-media box, so that pair fails the save instead of saving it blank.
  // A cut read is no proof the metadata is missing, and may end before the
  // box, so a cut read with nothing in it is marked incomplete instead, so the
  // save can retry.
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
    // With a caption the card names the creator; without one the card is
    // already the title, so the page's own description is the only new text.
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
