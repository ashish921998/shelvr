import { isInstagramUrl, isTikTokUrl } from "@convex/model/externalUrl";

export const SETUP_STEPS = ["tiktok", "instagram", "paste"] as const;
export type SetupStep = (typeof SETUP_STEPS)[number];

type SavedItem = { type: "link" | "image" | "note"; url?: string };

/** An account with this many saves is past setting up, whatever it saved. */
const SETUP_ITEM_LIMIT = 20;

/** Which "Get set up" steps the saves already show done. */
export function setupProgress(
  items: readonly SavedItem[],
): Record<SetupStep, boolean> {
  return {
    tiktok: items.some((item) => isTikTokUrl(item.url)),
    instagram: items.some(
      (item) => item.type === "image" || isInstagramUrl(item.url),
    ),
    paste: items.length >= 3 || items.some((item) => item.type === "note"),
  };
}

export function shouldShowSetup(
  progress: Record<SetupStep, boolean>,
  itemCount: number,
): boolean {
  return (
    itemCount < SETUP_ITEM_LIMIT && SETUP_STEPS.some((step) => !progress[step])
  );
}
