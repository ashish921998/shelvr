"use node";

import { z } from "zod";
import { logEvent } from "../log";
import {
  safeFetch,
  parseJson,
  PageFetchError,
  SHELVR_USER_AGENT,
  postField,
  type PageData,
} from "../pageReadCore";
import { callTreg, transcriptToken } from "../videoTranscript";

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
async function fetchTikTokOEmbed(url: string): Promise<PageData> {
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
  return tikTokPage(parseJson(result.bytes) as Record<string, unknown>);
}

function tikTokPage(data: Record<string, unknown>): PageData {
  const str = (key: string) => {
    const value = data[key];
    return typeof value === "string" && value !== "" ? value : undefined;
  };
  const width = Number(data.thumbnail_width);
  const height = Number(data.thumbnail_height);
  const handle = str("author_unique_id");
  const caption = str("title")?.trim() || undefined;
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
    // An empty oEmbed response is not evidence that the video names no places.
    ...(caption === undefined ? { incomplete: true } : {}),
  };
}

const tregPostSchema = z.object({
  aweme_detail: z.object({
    desc: z.string().nullish(),
    aweme_id: z.string().nullish(),
    author: z
      .object({
        unique_id: z.string().nullish(),
        nickname: z.string().nullish(),
      })
      .nullish(),
    video: z
      .object({
        width: z.number().nullish(),
        height: z.number().nullish(),
        cover: z.object({ url_list: z.array(z.string()).nullish() }).nullish(),
      })
      .nullish(),
  }),
});

async function fetchTikTokFromTreg(
  url: string,
  token: string,
): Promise<PageData | undefined> {
  const reply = await callTreg(
    "scrapecreators.tiktok.video.detail",
    new URLSearchParams({ url }),
    token,
  );
  if (reply.status !== "ok") {
    logEvent("warn", "tiktok_caption_read", {
      outcome: reply.status === "none" ? "none" : reply.errorCategory,
    });
    return undefined;
  }
  const post = tregPostSchema.safeParse(reply.payload);
  if (!post.success) {
    logEvent("warn", "tiktok_caption_read", { outcome: "bad_shape" });
    return undefined;
  }
  const detail = post.data.aweme_detail;
  logEvent("info", "tiktok_caption_read", {
    outcome: detail.desc ? "caption" : "no_caption",
  });
  return tikTokPage({
    title: detail.desc,
    author_unique_id: detail.author?.unique_id,
    author_name: detail.author?.nickname,
    embed_product_id: detail.aweme_id,
    thumbnail_url: detail.video?.cover?.url_list?.[0],
    thumbnail_width: detail.video?.width,
    thumbnail_height: detail.video?.height,
  });
}

export async function fetchTikTok(
  url: string,
  claimPaidRead: (() => Promise<boolean>) | undefined,
): Promise<PageData> {
  const free = await fetchTikTokOEmbed(url);
  const token = transcriptToken();
  if (
    free.content !== undefined ||
    claimPaidRead === undefined ||
    token === undefined
  ) {
    return free;
  }
  if (!(await claimPaidRead())) {
    logEvent("info", "tiktok_caption_read", { outcome: "not_claimed" });
    return free;
  }
  return (await fetchTikTokFromTreg(url, token)) ?? free;
}
