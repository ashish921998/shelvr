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

/**
 * "Get set up" is a new account's card only: it rides the save-goal card's gate
 * (fewer saves than the goal, never dismissed), so dismissing hides it for good
 * and an older account never sees it.
 */
export function shouldShowSetup(
  progress: Record<SetupStep, boolean>,
  itemCount: number,
  saveGoalCardVisible: boolean,
): boolean {
  return (
    saveGoalCardVisible &&
    itemCount < SETUP_ITEM_LIMIT &&
    SETUP_STEPS.some((step) => !progress[step])
  );
}
