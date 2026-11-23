import { analytics } from "@/lib/analytics";
import { getPendingInvite, subscribePendingInvite } from "@/lib/pending-invite";
import * as Clipboard from "expo-clipboard";
import { useEffect, useState, useSyncExternalStore } from "react";
import { AppState } from "react-native";

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
    const probe = () => {
      Clipboard.hasUrlAsync()
        .then((found) => {
          if (live) setHasUrl(found);
        })
        .catch((error: unknown) => {
          analytics.captureError("clipboard_invite_probe_failed", error);
        });
    };
    probe();
    const listener = AppState.addEventListener("change", (appState) => {
      if (appState === "active") probe();
    });
    return () => {
      live = false;
      listener.remove();
    };
  }, []);
  const take = async () =>
    clipboardInviteToken(
      await Clipboard.getStringAsync().catch((error: unknown) => {
        analytics.captureError("clipboard_invite_read_failed", error);
        return "";
      }),
    );
  return { offered: hasUrl && pending === null, take };
}
