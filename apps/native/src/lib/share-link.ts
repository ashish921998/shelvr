import { analytics } from "@/lib/analytics";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { CryptoDigestAlgorithm, digestStringAsync } from "expo-crypto";
import { useCallback } from "react";
import { Platform, Share } from "react-native";

/** Branded preview page for a shared item (`apps/web/src/app/i/[token]`). */
function shareLinkUrl(token: string): string {
  return `https://shelvr-web.vercel.app/i/${token}`;
}

/**
 * The analytics reference for a branded link: the first 16 hex characters of
 * its token's SHA-256, never the token itself, which opens the preview. The
 * web share page reports the same value, so a share joins to its views and
 * App Store clicks. Undefined for any other URL.
 */
export async function shareRefOf(
  url: string | undefined,
): Promise<string | undefined> {
  const token = url?.match(/\/i\/([^/?#]+)$/)?.[1];
  if (!token) return undefined;
  try {
    const digest = await digestStringAsync(CryptoDigestAlgorithm.SHA256, token);
    return digest.slice(0, 16).toLowerCase();
  } catch {
    return undefined;
  }
}

/** Convex queues mutations while offline and resolves only once the server
 * answers, so waiting on the mint unbounded would leave the share sheet shut.
 * After this long the caller falls back to the source URL. */
const SHARE_LINK_TIMEOUT_MS = 3000;

/** The branded link for an item, or undefined when it has none (unfinished,
 * an image) or the token could not be minted in time, e.g. offline. */
export function useShareLink() {
  const createShareLink = useMutation(api.items.createShareLink);
  const settle = useMutation(api.items.settleShareLink);
  return useCallback(
    async (itemId: string): Promise<string | undefined> => {
      const id = itemId as Id<"items">;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const minting = createShareLink({ itemId: id, settles: true });
      try {
        const token = await Promise.race([
          minting,
          new Promise<null>((resolve) => {
            timer = setTimeout(() => resolve(null), SHARE_LINK_TIMEOUT_MS);
          }),
        ]);
        if (token !== null) return shareLinkUrl(token);
        // Too late to use: the caller shares the source instead. The mint is
        // still queued, so the link it makes is taken back as soon as it
        // exists instead of staying published with nobody holding it.
        minting
          .then((late) =>
            late === null ? null : settle({ itemId: id, shared: false }),
          )
          .catch(() => {});
        return undefined;
      } catch {
        return undefined;
      } finally {
        clearTimeout(timer);
      }
    },
    [createShareLink, settle],
  );
}

/**
 * Tells the server how a share that minted the public link ended. The link is
 * published before the sheet opens, so a dismissed or failed share would
 * leave a public page behind; `shared: false` lets the server take it back,
 * and `shared: true` marks it as one that went out. Every surface that
 * shares reports here. Never awaited: the share is over either way.
 */
export function useSettleShareLink() {
  const settle = useMutation(api.items.settleShareLink);
  return useCallback(
    (itemId: string, shared: boolean): void => {
      settle({ itemId: itemId as Id<"items">, shared }).catch(
        (error: unknown) =>
          analytics.captureError("share_link_settle_failed", error),
      );
    },
    [settle],
  );
}

/** Android's share intent only carries `message`; iOS shares `url` as a link. */
export function shareUrl(url: string) {
  return Share.share(Platform.OS === "ios" ? { url } : { message: url });
}
