import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { useCallback } from "react";
import { Platform, Share } from "react-native";

/** Branded preview page for a shared item (`apps/web/src/app/i/[token]`). */
function shareLinkUrl(token: string): string {
  return `https://shelvr-web.vercel.app/i/${token}`;
}

/** The branded link for an item, or undefined when it has none (unfinished,
 * an image) or the token could not be minted, e.g. offline. */
export function useShareLink() {
  const createShareLink = useMutation(api.items.createShareLink);
  return useCallback(
    async (itemId: string): Promise<string | undefined> => {
      try {
        const token = await createShareLink({
          itemId: itemId as Id<"items">,
        });
        return token === null ? undefined : shareLinkUrl(token);
      } catch {
        return undefined;
      }
    },
    [createShareLink],
  );
}

/** Android's share intent only carries `message`; iOS shares `url` as a link. */
export function shareUrl(url: string) {
  return Share.share(Platform.OS === "ios" ? { url } : { message: url });
}
