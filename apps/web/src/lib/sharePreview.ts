import { convexSiteUrl } from "@/lib/convexSiteUrl";

type SharePreview = {
  type: "image" | "link" | "note";
  title: string;
  description?: string;
  imageUrl?: string;
  sourceUrl?: string;
  noteText?: string;
};

/**
 * Fetches the public preview for a branded item share link. Returns
 * `undefined` when Convex isn't configured, the token doesn't resolve to a
 * shareable item, or the request fails — every case the page renders as a
 * generic Shelvr promo rather than an error. Uncached, so a deleted item or
 * revoked link stops rendering at once.
 */
export async function fetchSharePreview(
  token: string,
): Promise<SharePreview | undefined> {
  const siteUrl = convexSiteUrl();
  if (!siteUrl) return undefined;

  try {
    const response = await fetch(
      `${siteUrl}/share/links/${encodeURIComponent(token)}`,
      { cache: "no-store" },
    );
    if (!response.ok) return undefined;
    return (await response.json()) as SharePreview;
  } catch {
    return undefined;
  }
}
