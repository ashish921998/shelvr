type SharePreview = {
  type: "image" | "link" | "note";
  title: string;
  description?: string;
  imageUrl?: string;
  sourceUrl?: string;
  noteText?: string;
};

/**
 * Base URL of the Convex deployment's HTTP actions. `CONVEX_SITE_URL` wins
 * when set; otherwise derive it from `CONVEX_URL` (`*.convex.cloud` serves
 * functions, the matching `*.convex.site` serves HTTP actions). Mirrors
 * `apps/web/src/app/api/android-waitlist/route.ts`.
 */
function convexSiteUrl(): string | undefined {
  const explicit = process.env.CONVEX_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const cloud = process.env.CONVEX_URL?.trim();
  if (!cloud || !cloud.includes(".convex.cloud")) return undefined;
  return cloud.replace(".convex.cloud", ".convex.site").replace(/\/$/, "");
}

/**
 * Fetches the public preview for a branded item share link. Returns
 * `undefined` when Convex isn't configured, the id doesn't resolve to a
 * ready item, or the request fails — every case the page renders as a
 * generic Shelvr promo rather than an error.
 */
export async function fetchSharePreview(
  itemId: string,
): Promise<SharePreview | undefined> {
  const siteUrl = convexSiteUrl();
  if (!siteUrl) return undefined;

  try {
    const response = await fetch(
      `${siteUrl}/share/items/${encodeURIComponent(itemId)}`,
      { next: { revalidate: 300 } },
    );
    if (!response.ok) return undefined;
    return (await response.json()) as SharePreview;
  } catch {
    return undefined;
  }
}
