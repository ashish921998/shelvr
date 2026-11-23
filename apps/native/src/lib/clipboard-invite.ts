import { getPendingInvite, subscribePendingInvite } from "@/lib/pending-invite";
import * as Clipboard from "expo-clipboard";
import { useEffect, useState, useSyncExternalStore } from "react";

const INVITE_HOSTS = ["tryshelvr.app", "shelvr-web.vercel.app"];

export function clipboardInviteToken(text: string): string | null {
  try {
    const url = new URL(text.trim());
    if (url.protocol !== "https:" || !INVITE_HOSTS.includes(url.hostname)) {
      return null;
    }
    return /^\/l\/([^/?#]+)\/?$/.exec(url.pathname)?.[1] ?? null;
  } catch {
    return null;
  }
}

export function useClipboardInvite() {
  const [hasUrl, setHasUrl] = useState(false);
  const pending = useSyncExternalStore(
    subscribePendingInvite,
    getPendingInvite,
    getPendingInvite,
  );
  useEffect(() => {
    let live = true;
    Clipboard.hasUrlAsync()
      .then((found) => {
        if (live) setHasUrl(found);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  const take = async () =>
    clipboardInviteToken(await Clipboard.getStringAsync().catch(() => ""));
  return { offered: hasUrl && pending === null, take };
}
