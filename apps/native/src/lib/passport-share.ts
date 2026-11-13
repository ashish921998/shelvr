import { analytics } from "@/lib/analytics";
import { openPaywall } from "@/lib/entitlement";
import { t } from "@/lib/i18n";
import { shareUrl } from "@/lib/share-link";
import { webUrl } from "@/lib/web-url";
import { api } from "@convex/_generated/api";
import { saveErrorCode } from "@convex/model/saveErrors";
import { cityKey } from "@convex/model/trip";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useConvexAuth, useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Share } from "react-native";

type Compare = NonNullable<
  FunctionReturnType<typeof api.passportShares.comparePassport>
>;
type ComparePlace = Compare["both"][number];

export function passportUrl(token: string): string {
  return webUrl(`/passport/${encodeURIComponent(token)}`);
}

export function compareCities(places: readonly ComparePlace[]) {
  const groups = new Map<string, { city: string | null; names: string[] }>();
  for (const place of places) {
    const key = place.city ? cityKey(place.city) : "";
    const group = groups.get(key);
    if (group) group.names.push(place.name);
    else groups.set(key, { city: place.city ?? null, names: [place.name] });
  }
  return [...groups.values()].sort(
    (a, b) => Number(a.city === null) - Number(b.city === null),
  );
}

export function usePassportShare() {
  const { isAuthenticated } = useConvexAuth();
  const share = useQuery(
    convexQuery(
      api.passportShares.myPassportShare,
      isAuthenticated ? {} : "skip",
    ),
  );
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
    Alert.alert(
      t("passportShare.stopTitle"),
      t("passportShare.stopBody"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("passportShare.stop"),
          style: "destructive",
          onPress: () => {
            stop({})
              .then(() => analytics.capture("passport_sharing_stopped", {}))
              .catch((error: unknown) => {
                analytics.captureError("passport_stop_sharing_failed", error);
                Alert.alert(
                  t("errors.unexpectedTitle"),
                  t("errors.retrySoon"),
                );
              });
          },
        },
      ],
    );
  }, [stop]);
}

export function useSaveFriendPlaces(token: string, ownerName?: string) {
  const router = useRouter();
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
      analytics.capture("passport_friend_places_saved", result);
      setSaved(result.saved);
    } catch (error) {
      if (saveErrorCode(error) === "pro_required") {
        await openPaywall(router, "passport_friend_places");
        return;
      }
      analytics.captureError("passport_friend_places_failed", error);
      Alert.alert(t("errors.unexpectedTitle"), t("errors.retrySoon"));
    } finally {
      setBusy(false);
    }
  }, [busy, save, token, ownerName, router]);
  return { save: run, busy, saved };
}
