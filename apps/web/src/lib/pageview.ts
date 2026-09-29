import { captureWebAnalyticsEvent } from "@/lib/analytics";
import { arrivalCampaign } from "@/lib/appStore";
import { sharePageUrl } from "@/lib/shareRef";

/** The referring site's host only: a full referrer URL can carry another
 * site's query string, and the host is all attribution needs. */
function referringDomain(referrer: string): string | undefined {
  try {
    return referrer ? new URL(referrer).hostname : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Counts one page view with the visit's campaign (`?ct=` or `utm_campaign`,
 * kept for the session) and the site that sent it, so a post's link can be
 * measured before anyone taps the store button.
 */
export function capturePageview() {
  const campaign = arrivalCampaign(window.location.search);
  const domain = referringDomain(document.referrer);
  captureWebAnalyticsEvent("$pageview", {
    $pathname: window.location.pathname,
    ...(campaign ? { campaign } : {}),
    ...(domain ? { $referring_domain: domain } : {}),
    // A share link's token is a capability, so it never reaches analytics.
    ...(window.location.pathname.startsWith("/i/")
      ? { $pathname: "/i/[token]", $current_url: sharePageUrl() }
      : {}),
  });
}
