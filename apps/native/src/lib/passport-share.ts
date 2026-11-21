import { analytics } from "@/lib/analytics";
import { t } from "@/lib/i18n";
import { useProGate } from "@/lib/pro-gate";
import { shareUrl } from "@/lib/share-link";
import { webUrl } from "@/lib/web-url";
import { api } from "@convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useConvexAuth, useMutation } from "convex/react";
import { useCallback, useEffect, useState } from "react";
import { Alert, Share } from "react-native";

export function passportUrl(token: string): string {
  return webUrl(`/passport/${encodeURIComponent(token)}`);
}

export function usePassportShare() {
  const { isAuthenticated } = useConvexAuth();
  const share = useQuery(
    convexQuery(
      api.passportShares.myPassportShare,
      isAuthenticated ? {} : "skip",
    ),
  );
  useEffect(() => {
    if (share.error) {
      analytics.captureError("passport_share_load_failed", share.error);
    }
  }, [share.error]);
  return share.data ?? null;
}

export function useSharePassport(places: number) {
  const mint = useMutation(api.passportShares.sharePassport);
  const [busy, setBusy] = useState(false);
  const share = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await shareUrl(passportUrl(await mint({})));
      analytics.capture("passport_shared", {
        places,
        shared: result.action === Share.sharedAction,
      });
    } catch (error) {
      analytics.captureError("passport_share_failed", error);
      Alert.alert(t("errors.unexpectedTitle"), t("errors.retrySoon"));
    } finally {
      setBusy(false);
    }
  }, [busy, mint, places]);
  return { share, busy };
}

export function useStopSharingPassport() {
  const stop = useMutation(api.passportShares.stopSharingPassport);
  return useCallback(() => {
    Alert.alert(t("passportShare.stopTitle"), t("passportShare.stopBody"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("passportShare.stop"),
        style: "destructive",
        onPress: () => {
          stop({})
            .then(() => analytics.capture("passport_sharing_stopped", {}))
            .catch((error: unknown) => {
              analytics.captureError("passport_stop_sharing_failed", error);
              Alert.alert(t("errors.unexpectedTitle"), t("errors.retrySoon"));
            });
        },
      },
    ]);
  }, [stop]);
}

export function useSaveFriendPlaces(token: string, ownerName?: string) {
  const { denied, passed } = useProGate("passport_friend_places");
  const save = useMutation(api.passportShares.saveFriendPlaces);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<number | null>(null);
  const run = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await save({
        token,
        note:
          ownerName === undefined
            ? t("passportShare.fromFriendNoName")
            : t("passportShare.fromFriend", { name: ownerName }),
      });
      if (result === null) {
        Alert.alert(t("passportShare.deadTitle"));
        return;
      }
      passed();
      analytics.capture("passport_friend_places_saved", result);
      setSaved((before) => (before ?? 0) + result.saved);
    } catch (error) {
      if (await denied(error)) return;
      analytics.captureError("passport_friend_places_failed", error);
      Alert.alert(t("errors.unexpectedTitle"), t("errors.retrySoon"));
    } finally {
      setBusy(false);
    }
  }, [busy, save, token, ownerName, denied, passed]);
  return { save: run, busy, saved };
}
