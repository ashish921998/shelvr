"use node";

/** Single page-reading entry point; host knowledge stays in the page readers.
 * Node-only: never import from a query, mutation or schema. */
import type { Id } from "../_generated/dataModel";
import { linkSource, shortFormSource, type LinkSource } from "./externalUrl";
import {
  safeFetch,
  BROWSER_USER_AGENT,
  PageFetchError,
  isPageFetchError,
  fetchPage,
  captionText,
  withLinkedRecipe,
  type PageData,
} from "./pageReadCore";
import { fetchTikTokOEmbed } from "./readers/tiktok";
import { fetchYouTube } from "./readers/youtube";
import { fetchXPost } from "./readers/x";
import { fetchInstagram } from "./readers/instagram";
import { fetchPinterestPin } from "./readers/pinterest";

export {
  extractBodyText,
  firstLinkedUrl,
  fetchErrorCategory,
  PROMPT_CONTENT_CHARS,
} from "./pageReadCore";
export type { PageData } from "./pageReadCore";
export { fetchXoEmbed, fetchXPost } from "./readers/x";
export { parseInstagramEmbed, fetchInstagram } from "./readers/instagram";
export { pinterestPage } from "./readers/pinterest";

/**
 * Copy a preview into Convex storage through the connection-bound URL policy.
 * Clients receive only the stored copy. A refused or oversized image leaves
 * the save without a cover rather than exposing the remote URL to clients.
 */
export async function storePoster(
  ctx: { storage: { store: (blob: Blob) => Promise<Id<"_storage">> } },
  imageUrl: string,
): Promise<Id<"_storage"> | undefined> {
  const result = await safeFetch(imageUrl, {
    timeoutMs: 10000,
    maxBytes: 3 * 1024 * 1024,
    allowContentType: (ct) =>
      ct.startsWith("image/jpeg") ||
      ct.startsWith("image/png") ||
      ct.startsWith("image/webp"),
    headers: { "User-Agent": BROWSER_USER_AGENT },
  });
  if (!result.ok) {
    return undefined;
  }
  try {
    return await ctx.storage.store(
      new Blob([new Uint8Array(result.bytes)], {
        type: result.contentType.split(";")[0],
      }),
    );
  } catch {
    return undefined;
  }
}

/** True when the page will never be readable: the resource is gone (404/410).
 * Such an item must NOT be classified from its URL alone — the model would
 * invent content from the slug. Exported pure for unit testing. */
export function pageGone(status: number | undefined): boolean {
  return status === 404 || status === 410;
}

/**
 * Pure decision for the enrichment flag a finalized item earns from one
 * pipeline run, taken straight from the page-read outcome: "partial" when the
 * page could not be read at all (retryable — the classifier worked from the
 * URL alone), "no_article" when the page read fine but yielded no extractable
 * article body (the URL itself is the save; a retry cannot change the
 * outcome), undefined when fully enriched. A missing read (images/notes never
 * fetch a page) is fully enriched; "gone" never reaches finalize — a gone
 * page fails the item instead. Exported pure for unit testing.
 */
export function linkEnrichment(
  read: { status: "ok"; page: PageData } | { status: "unreadable" } | undefined,
): "partial" | "no_article" | undefined {
  if (read === undefined) {
    return undefined;
  }
  if (read.status === "unreadable" || read.page.incomplete) {
    return "partial";
  }
  return read.page.content || read.page.media?.length
    ? undefined
    : "no_article";
}

/** The three outcomes that matter when reading a link's page: got it, the page
 * is gone for good (no classification, no retry), or it could not be read this
 * time (classify from the URL alone, retry later). Keeps the branching out of
 * processItem's body; failed outcomes carry the error for sanitized logging. */
type PageRead =
  | PageReadOk
  | { status: "gone"; error: PageFetchError }
  | { status: "unreadable"; error: PageFetchError };

/** A page that was read. Beyond the page itself it carries what the caller
 * would otherwise have to work out from the URL. */
type PageReadOk = {
  status: "ok";
  page: PageData;
  /** True when the model may be asked to propose a recipe: the page is a
   * caption source, the caption was read in full and not cut short, and no
   * structured recipe was already accepted from markup. */
  askForRecipe: boolean;
  /** Set when the link is a short-form social post (TikTok, Instagram), whose
   * only text is a caption and whose poster URL expires. */
  shortForm?: ShortFormSource;
};

export type ShortFormSource = NonNullable<ReturnType<typeof shortFormSource>>;

/** The read outcomes that reach finalizeItem: "gone" fails the item before
 * classification, and the fetch error is dropped — nothing downstream of the
 * sanitized log rereads it. */
export type LinkRead = PageReadOk | { status: "unreadable" };

/** The model proposes a recipe only from a caption it can read in full, and
 * only when the caption's own link did not already yield the structured
 * recipe. Web pages and URL-only reads never ask: nothing to read exactly. */
function mayAskForRecipe(page: PageData): boolean {
  return (
    page.recipe === undefined &&
    // A cut caption reads as complete at any length, so the length check alone
    // would let the model transcribe a recipe that stops mid-ingredient.
    page.truncated !== true &&
    page.caption === true &&
    captionText(page) !== undefined
  );
}

/** Marks a reader's page as a caption: TikTok, X and Instagram only ever return
 * a post's caption. */
async function asCaption(read: Promise<PageData>): Promise<PageData> {
  return { ...(await read), caption: true };
}

/** An Instagram read's content is only ever the captioned embed's caption,
 * the whole of it; a post read from its card alone has none. */
async function asInstagramCaption(read: Promise<PageData>): Promise<PageData> {
  const page = await read;
  return page.content === undefined ? page : { ...page, caption: true };
}

/** The reader for each platform with its own, each following its caption's
 * link to a recipe. Pinterest does that only for a pin it read from the
 * widget: its page fallback is not a caption, so it neither is marked one nor
 * has its links followed. */
const SOURCE_READERS = {
  tiktok: async (url) =>
    withLinkedRecipe(await asCaption(fetchTikTokOEmbed(url))),
  x: async (url) => withLinkedRecipe(await asCaption(fetchXPost(url))),
  instagram: async (url) =>
    withLinkedRecipe(await asInstagramCaption(fetchInstagram(url))),
  pinterest: fetchPinterestPin,
  youtube: fetchYouTube,
} satisfies Record<LinkSource, (url: string) => Promise<PageData>>;

export async function readPage(url: string): Promise<PageRead> {
  try {
    const source = linkSource(url);
    const page = source
      ? await SOURCE_READERS[source](url)
      : await fetchPage(url);
    const urlShortForm = shortFormSource(url);
    // The URL marks reels and TikToks as video; the reader also knows an
    // Instagram `/p/` post that is a video.
    const shortForm = urlShortForm && {
      ...urlShortForm,
      video: urlShortForm.video || page.video === true,
    };
    return {
      status: "ok",
      page,
      askForRecipe: mayAskForRecipe(page),
      ...(shortForm ? { shortForm } : {}),
    };
  } catch (error) {
    if (!isPageFetchError(error)) {
      throw error;
    }
    return pageGone(error.status)
      ? { status: "gone", error }
      : { status: "unreadable", error };
  }
}
