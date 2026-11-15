import { arrivalCampaign } from "@/lib/appStore";
import { maskTokenPath } from "@/lib/tokenPath";

type PageLocation = Pick<Location, "origin" | "pathname" | "search">;

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
  const path = maskTokenPath(location.pathname);
  const campaign = arrivalCampaign(location.search);
  return {
    $current_url: `${location.origin}${path}`,
    $pathname: path,
    $referring_domain: referringDomain(referrer, location.origin),
    ...(campaign ? { campaign } : {}),
  };
}
