import type { Doc } from "../_generated/dataModel";
import { isYouTubeUrl, linkSource, shortFormSource } from "./externalUrl";
import {
  COOK_MIN_AGE_MS,
  READ_MAX_AGE_MS,
  READ_MIN_AGE_MS,
  reminderKind,
} from "./saveReminders";

export type NextUpKind = "read" | "cook" | "watch" | "open";

/**
 * What the home "Next up" card would ask of a save at `now`, or undefined
 * when the save is not due. A recipe is due once it is old enough to have
 * been forgotten; anything else only inside the read window, as a video to
 * watch, an article to read, or a save to open.
 */
export function nextUpKind(
  item: Doc<"items">,
  now: number,
): NextUpKind | undefined {
  const age = now - item._creationTime;
  const reminder = reminderKind(item);
  if (reminder === "cook") return age >= COOK_MIN_AGE_MS ? "cook" : undefined;
  if (age < READ_MIN_AGE_MS || age > READ_MAX_AGE_MS) return undefined;
  if (
    isYouTubeUrl(item.url) ||
    shortFormSource(item.url)?.video ||
    item.media?.some((media) => media.kind === "video")
  )
    return "watch";
  if (reminder === "read" && linkSource(item.url) === undefined) return "read";
  return "open";
}
