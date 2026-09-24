import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { useCallback } from "react";
import { Platform, Share } from "react-native";

/** Branded preview page for a shared item (`apps/web/src/app/i/[token]`). */
function shareLinkUrl(token: string): string {
  return `https://shelvr-web.vercel.app/i/${token}`;
}

/** Convex queues mutations while offline and resolves only once the server
 * answers, so waiting on the mint unbounded would leave the share sheet shut.
 * After this long the caller falls back to the source URL. */
const SHARE_LINK_TIMEOUT_MS = 3000;

/** The branded link for an item, or undefined when it has none (unfinished,
 * an image) or the token could not be minted in time, e.g. offline. */
export function useShareLink() {
  const createShareLink = useMutation(api.items.createShareLink);
  return useCallback(
    async (itemId: string): Promise<string | undefined> => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const token = await Promise.race([
          createShareLink({ itemId: itemId as Id<"items"> }),
          new Promise<null>((resolve) => {
            timer = setTimeout(() => resolve(null), SHARE_LINK_TIMEOUT_MS);
          }),
        ]);
        return token === null ? undefined : shareLinkUrl(token);
      } catch {
        return undefined;
      } finally {
        clearTimeout(timer);
      }
    },
    [createShareLink],
  );
}

/** Android's share intent only carries `message`; iOS shares `url` as a link. */
export function shareUrl(url: string) {
  return Share.share(Platform.OS === "ios" ? { url } : { message: url });
}
