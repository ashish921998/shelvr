"use node";

import type { Id } from "../_generated/dataModel";
import {
  isGoogleMapsUrl,
  linkSource,
  shortFormSource,
  type LinkSource,
} from "./externalUrl";
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
import { fetchTikTok } from "./readers/tiktok";
import { fetchYouTube } from "./readers/youtube";
import { fetchXPost } from "./readers/x";
import { fetchInstagram } from "./readers/instagram";
import { fetchPinterestPin } from "./readers/pinterest";
import { fetchGoogleMapsList } from "./readers/googleMaps";

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

const MAX_POSTER_BYTES = 8 * 1024 * 1024;

export async function storePoster(
  ctx: { storage: { store: (blob: Blob) => Promise<Id<"_storage">> } },
  imageUrl: string,
): Promise<Id<"_storage"> | undefined> {
  const result = await safeFetch(imageUrl, {
    timeoutMs: 10000,
    maxBytes: MAX_POSTER_BYTES,
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

export function pageGone(status: number | undefined): boolean {
  return status === 404 || status === 410;
}

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

type PageRead =
  | PageReadOk
  | { status: "gone"; error: PageFetchError }
  | { status: "unreadable"; error: PageFetchError };

type PageReadOk = {
  status: "ok";
  page: PageData;
  askForRecipe: boolean;
  shortForm?: ShortFormSource;
};

export type ShortFormSource = NonNullable<ReturnType<typeof shortFormSource>>;

export type LinkRead = PageReadOk | { status: "unreadable" };

function mayAskForRecipe(page: PageData): boolean {
  return (
    page.recipe === undefined &&
    page.truncated !== true &&
    page.caption === true &&
    captionText(page) !== undefined
  );
}

async function asCaption(read: Promise<PageData>): Promise<PageData> {
  return { ...(await read), caption: true };
}

async function asInstagramCaption(read: Promise<PageData>): Promise<PageData> {
  const page = await read;
  return page.content === undefined ? page : { ...page, caption: true };
}

type ReadOptions = {
  /** Skip the linked-recipe fetches a caption may trigger, for callers that only want the caption. */
  captionOnly?: boolean;
  claimPaidRead?: () => Promise<boolean>;
};

const SOURCE_READERS = {
  tiktok: async (url, { captionOnly, claimPaidRead }) => {
    const page = await asCaption(fetchTikTok(url, claimPaidRead));
    return captionOnly ? page : withLinkedRecipe(page);
  },
  x: async (url) => withLinkedRecipe(await asCaption(fetchXPost(url))),
  instagram: async (url, { captionOnly }) => {
    const page = await asInstagramCaption(fetchInstagram(url));
    return captionOnly ? page : withLinkedRecipe(page);
  },
  pinterest: fetchPinterestPin,
  youtube: fetchYouTube,
} satisfies Record<
  LinkSource,
  (url: string, options: ReadOptions) => Promise<PageData>
>;

async function readUnsourced(url: string): Promise<PageData> {
  const list = isGoogleMapsUrl(url)
    ? await fetchGoogleMapsList(url)
    : undefined;
  return list ?? (await fetchPage(url));
}

export async function readPage(
  url: string,
  options: ReadOptions = {},
): Promise<PageRead> {
  try {
    const source = linkSource(url);
    const page = source
      ? await SOURCE_READERS[source](url, options)
      : await readUnsourced(url);
    const urlShortForm = shortFormSource(url);
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
