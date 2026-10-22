import { analytics } from "@/lib/analytics";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { CryptoDigestAlgorithm, digestStringAsync } from "expo-crypto";
import { useCallback } from "react";
import { Platform, Share } from "react-native";

function shareLinkUrl(token: string): string {
  return `https://shelvr-web.vercel.app/i/${token}`;
}

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

const SHARE_LINK_TIMEOUT_MS = 3000;

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
