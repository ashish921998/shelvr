import { analytics } from "@/lib/analytics";
import { claimedInviteToken } from "@/lib/invite-link";
import { getPendingInvite, subscribePendingInvite } from "@/lib/pending-invite";
import * as Clipboard from "expo-clipboard";
import { useEffect, useState, useSyncExternalStore } from "react";
import { AppState, Platform } from "react-native";

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
      (Platform.OS === "ios"
        ? Clipboard.hasUrlAsync
        : Clipboard.hasStringAsync)()
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
    claimedInviteToken(
      await Clipboard.getStringAsync().catch((error: unknown) => {
        analytics.captureError("clipboard_invite_read_failed", error);
        return "";
      }),
    );
  return { offered: hasUrl && pending === null, take };
}
