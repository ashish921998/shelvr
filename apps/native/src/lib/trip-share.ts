import { useRef } from "react";
import { Alert } from "react-native";
import { useMutation } from "convex/react";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { analytics } from "@/lib/analytics";
import { t } from "@/lib/i18n";
import { shareUrl } from "@/lib/share-link";

export function useTripShare(tripId: Id<"tripPlans">) {
  const busy = useRef(false);
  const current = useQuery(
    convexQuery(api.tripShares.getShareToken, { tripId }),
  );
  const create = useMutation(api.tripShares.createShare);
  const revoke = useMutation(api.tripShares.revokeShare);
  const share = async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const token = await create({ tripId });
      const base = (
        process.env.EXPO_PUBLIC_WEB_URL || "https://shelvr-web.vercel.app"
      ).replace(/\/+$/, "");
      await shareUrl(`${base}/t/${token}`);
    } catch (error) {
      analytics.captureError("trip_share_failed", error);
      Alert.alert(t("errors.unexpectedTitle"), t("errors.retrySoon"));
    } finally {
      busy.current = false;
    }
  };
  const stopSharing = () => {
    const token = current.data;
    if (!token) return;
    Alert.alert(t("tripShare.stop"), t("tripShare.stopHint"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("tripShare.stop"),
        style: "destructive",
        onPress: () => {
          void revoke({ tripId, token }).catch((error: unknown) => {
            analytics.captureError("trip_share_revoke_failed", error);
            Alert.alert(t("errors.unexpectedTitle"), t("errors.retrySoon"));
          });
        },
      },
    ]);
  };
  const startSharing = () =>
    Alert.alert(t("tripShare.title"), t("tripShare.hint"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("common.share"), onPress: () => void share() },
    ]);
  return { startSharing, stopSharing, shared: !!current.data };
}
