import { arrivalCampaign } from "@/lib/appStore";

type PageLocation = Pick<Location, "origin" | "pathname" | "search">;

/**
 * The path a page view reports. A share page's path carries the token that
 * opens the shared item, so it is replaced, the same way `sharePageUrl` does.
 */
export function pageViewPath(pathname: string): string {
  return pathname.startsWith("/i/") ? "/i/[token]" : pathname;
}

/**
 * Only the host of the page that linked here (`www.reddit.com`), never its
 * full URL, which can name a private thread or carry a query. A visit with no
 * referrer, or one from this site, reads `$direct`, as PostHog's own does.
 */
export function referringDomain(referrer: string, origin: string): string {
  try {
    const url = new URL(referrer);
    if (url.origin === origin) return "$direct";
    return url.hostname || "$direct";
  } catch {
    return "$direct";
  }
}

/**
 * The properties of one `$pageview`: the path without its query (an oracle
 * verdict rides in `?c=`), the campaign the visitor arrived with (`?ct=` or
 * `utm_campaign`, kept for the session), and where they came from.
 */
export function pageViewProperties(location: PageLocation, referrer: string) {
  const path = pageViewPath(location.pathname);
  const campaign = arrivalCampaign(location.search);
  return {
    $current_url: `${location.origin}${path}`,
    $pathname: path,
    $referring_domain: referringDomain(referrer, location.origin),
    ...(campaign ? { campaign } : {}),
  };
}
