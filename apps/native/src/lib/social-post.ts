import { shortFormSource } from "@convex/model/externalUrl";
import type { PostMedia } from "@convex/model/itemFields";

import { displayHost } from "@/lib/url";

export type SocialPost = { site: string; playable: boolean };

export function socialPost(item: {
  type: "image" | "link" | "note";
  url?: string;
  siteName?: string;
  media?: PostMedia[];
}): SocialPost | undefined {
  if (item.type !== "link") return undefined;
  const shortForm = shortFormSource(item.url);
  if (shortForm) return { site: shortForm.site, playable: shortForm.video };
  const lead = item.media?.[0];
  if (lead === undefined) return undefined;
  return {
    site: item.siteName ?? displayHost(item.url),
    playable: lead.kind !== "photo",
  };
}
