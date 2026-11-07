import { arrivalCampaign } from "@/lib/appStore";

type PageLocation = Pick<Location, "origin" | "pathname" | "search">;

export function pageViewPath(pathname: string): string {
  if (pathname.startsWith("/i/")) return "/i/[token]";
  if (pathname.startsWith("/p/")) return "/p/[token]";
  return pathname;
}

export function referringDomain(referrer: string, origin: string): string {
  try {
    const url = new URL(referrer);
    if (url.origin === origin) return "$direct";
    return url.hostname || "$direct";
  } catch {
    return "$direct";
  }
}

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

export function pageLeaveProperties(
  pathname: string,
  viewedAt: number,
  now = Date.now(),
) {
  const path = pageViewPath(pathname);
  return {
    $pathname: path,
    $prev_pageview_pathname: path,
    $prev_pageview_duration: (now - viewedAt) / 1000,
  };
}

const WEB_VITALS = new Set(["CLS", "FCP", "INP", "LCP"]);

export function webVitalProperties(
  metric: { name: string; value: number },
  pathname: string,
) {
  if (!WEB_VITALS.has(metric.name)) return null;
  return {
    $pathname: pageViewPath(pathname),
    [`$web_vitals_${metric.name}_value`]: metric.value,
  };
}
