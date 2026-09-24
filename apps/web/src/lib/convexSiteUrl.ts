/**
 * Base URL of the Convex deployment's HTTP actions. `CONVEX_SITE_URL` wins
 * when set; otherwise derive it from `CONVEX_URL` (`*.convex.cloud` serves
 * functions, the matching `*.convex.site` serves HTTP actions).
 */
export function convexSiteUrl(): string | undefined {
  const explicit = process.env.CONVEX_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const cloud = process.env.CONVEX_URL?.trim();
  if (!cloud || !cloud.includes(".convex.cloud")) return undefined;
  return cloud.replace(".convex.cloud", ".convex.site").replace(/\/$/, "");
}
