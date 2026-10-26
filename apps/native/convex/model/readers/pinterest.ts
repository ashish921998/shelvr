"use node";

import {
  z,
  safeFetch,
  parseJson,
  PageFetchError,
  SHELVR_USER_AGENT,
  PAGE_FETCH_OPTIONS,
  decodeEntities,
  fetchPage,
  fetchErrorCategory,
  isTransientFetchFailure,
  withLinkedRecipe,
  logEvent,
  type PageData,
} from "../pageReadCore";
import {
  pinterestPinId,
  isPinterestShortUrl,
  isPinterestHost,
} from "../externalUrl";

const pinterestImageSchema = z.object({
  url: z.url(),
  width: z.number().positive(),
  height: z.number().positive(),
});

const pinterestPinSchema = z.object({
  title: z.string().nullish(),
  grid_title: z.string().nullish(),
  description: z.string().nullish(),
  link: z.string().nullish(),
  images: z.record(z.string(), pinterestImageSchema).nullish(),
  videos: z.object({ video_list: z.record(z.string(), z.unknown()) }).nullish(),
  board: z.object({ name: z.string().nullish() }).nullish(),
  pinner: z
    .object({
      full_name: z.string().nullish(),
      username: z.string().nullish(),
    })
    .nullish(),
  rich_metadata: z.object({ title: z.string().nullish() }).nullish(),
});

const pinterestWidgetSchema = z.object({
  data: z.array(pinterestPinSchema.nullish().catch(null)),
});

type PinterestPin = z.infer<typeof pinterestPinSchema>;

type PinterestWidget =
  | { status: "ok"; pin: PinterestPin }
  | { status: "missing" }
  | { status: "transient"; errorCategory: string };

async function resolvePinterestUrl(
  url: string,
): Promise<{ id?: string; url: string }> {
  const id = pinterestPinId(url);
  if (id !== undefined || !isPinterestShortUrl(url)) {
    return { id, url };
  }
  const result = await safeFetch(url, {
    ...PAGE_FETCH_OPTIONS,
    maxRedirects: 5,
  });
  if (!result.ok) {
    throw new PageFetchError(result.code, result.status);
  }
  if (isPinterestHomePage(result.finalUrl)) {
    throw new PageFetchError("http_error", 404);
  }
  return { id: pinterestPinId(result.finalUrl), url: result.finalUrl };
}

function isPinterestHomePage(url: string): boolean {
  const parsed = new URL(url);
  return isPinterestHost(parsed.hostname) && parsed.pathname === "/";
}

async function readPinterestWidget(id: string): Promise<PinterestWidget> {
  let result: Awaited<ReturnType<typeof safeFetch>>;
  try {
    result = await safeFetch(
      `https://widgets.pinterest.com/v3/pidgets/pins/info/?pin_ids=${id}`,
      {
        timeoutMs: 15000,
        maxBytes: 256 * 1024,
        allowContentType: (ct) => ct.startsWith("application/json"),
        headers: {
          "User-Agent": SHELVR_USER_AGENT,
          Accept: "application/json",
        },
      },
    );
  } catch (error) {
    return { status: "transient", errorCategory: fetchErrorCategory(error) };
  }
  if (!result.ok) {
    return isTransientFetchFailure(result.code, result.status)
      ? {
          status: "transient",
          errorCategory: `page_fetch_error:${result.code}`,
        }
      : { status: "missing" };
  }
  let body: unknown;
  try {
    body = parseJson(result.bytes);
  } catch {
    return { status: "transient", errorCategory: "invalid_json" };
  }
  const pin = pinterestWidgetSchema.safeParse(body).data?.data[0];
  return pin ? { status: "ok", pin } : { status: "missing" };
}

function pinterestImage(
  images: PinterestPin["images"],
): { url: string; aspectRatio: number } | undefined {
  const largest = Object.values(images ?? {}).reduce<
    z.infer<typeof pinterestImageSchema> | undefined
  >(
    (best, image) =>
      best === undefined || image.width > best.width ? image : best,
    undefined,
  );
  if (largest === undefined) {
    return undefined;
  }
  const url = new URL(largest.url);
  if (url.hostname === "i.pinimg.com") {
    url.pathname = url.pathname.replace(/^\/\d+x\//, "/736x/");
  }
  return {
    url: url.toString(),
    aspectRatio: largest.width / largest.height,
  };
}

function pinterestSourceLink(
  link: string | null | undefined,
): string | undefined {
  if (!link) {
    return undefined;
  }
  try {
    const url = new URL(link);
    return (url.protocol === "https:" || url.protocol === "http:") &&
      !isPinterestHost(url.hostname)
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

function pinterestName(name: string | null | undefined): string | undefined {
  let decoded = name?.trim();
  for (let pass = 0; decoded && pass < 3; pass++) {
    const next = decodeEntities(decoded);
    if (next === decoded) break;
    decoded = next;
  }
  return decoded || undefined;
}

export function pinterestPage(pin: PinterestPin): PageData | undefined {
  const image = pinterestImage(pin.images);
  const description = pin.description
    ? decodeEntities(pin.description).trim()
    : "";
  if (image === undefined && description === "") {
    return undefined;
  }
  const title = (pin.grid_title || pin.title)?.trim();
  const sourceLink = pinterestSourceLink(pin.link);
  const sourceTitle = pin.rich_metadata?.title?.trim();
  return {
    title: title ? decodeEntities(title) : undefined,
    siteName: "Pinterest",
    author:
      pinterestName(pin.pinner?.full_name) || pin.pinner?.username || undefined,
    heroImageUrl: image?.url,
    heroAspectRatio: image?.aspectRatio,
    content: description || undefined,
    caption: true,
    board: pin.board?.name?.trim() || undefined,
    video:
      Object.keys(pin.videos?.video_list ?? {}).length > 0 ? true : undefined,
    linkedUrl: sourceLink,
    linkedTitle:
      sourceLink && sourceTitle ? decodeEntities(sourceTitle) : undefined,
  };
}

export async function fetchPinterestPin(url: string): Promise<PageData> {
  const resolved = await resolvePinterestUrl(url);
  const widget =
    resolved.id === undefined
      ? ({ status: "missing" } as const)
      : await readPinterestWidget(resolved.id);
  if (widget.status === "ok") {
    const page = pinterestPage(widget.pin);
    if (page !== undefined) {
      return withLinkedRecipe(page);
    }
  }
  if (widget.status === "transient") {
    logEvent("warn", "pinterest_widget_failed", {
      error_category: widget.errorCategory,
    });
    return {
      ...(await fetchPage(resolved.url, isPinterestHomePage)),
      incomplete: true,
    };
  }
  return fetchPage(resolved.url, isPinterestHomePage);
}
