import { t } from "@/lib/i18n";
import { analytics } from "@/lib/analytics";
import { openPaywall } from "@/lib/entitlement";
import { readConvexUrl } from "@/lib/convex-url";
import { shareUrl } from "@/lib/share-link";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { saveErrorCode } from "@convex/model/saveErrors";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { useRef } from "react";
import { Alert } from "react-native";

export function useTripShare(tripId: Id<"tripPlans">) {
  const token = useQuery(api.tripShares.getShareToken, { tripId });
  const create = useMutation(api.tripShares.createShare);
  const revoke = useMutation(api.tripShares.revokeShare);
  const busy = useRef(false);
  const router = useRouter();

  const run = async (action: () => Promise<unknown>) => {
    if (busy.current) return;
    busy.current = true;
    try {
      await action();
    } catch (error) {
      if (saveErrorCode(error) === "pro_required") {
        await openPaywall(router, "trip_share");
        return;
      }
      analytics.captureError("trip_share_failed", error);
      Alert.alert(t("errors.unexpectedTitle"), t("errors.retrySoon"));
    } finally {
      busy.current = false;
    }
  };

  const share = () =>
    run(async () => {
      const site =
        process.env.EXPO_PUBLIC_CONVEX_SITE_URL ??
        readConvexUrl().replace(".convex.cloud", ".convex.site");
      const linkToken = token || (await create({ tripId }));
      await shareUrl(new URL(`/trip/shared/${linkToken}`, site).href);
    });

  const stopSharing = (currentToken: string) =>
    Alert.alert(t("tripShare.revoke"), t("tripShare.revokeBody"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("tripShare.revoke"),
        style: "destructive",
        onPress: () => void run(() => revoke({ tripId, token: currentToken })),
      },
    ]);

  const open = () => {
    if (token === undefined || busy.current) return;
    const cancel = { text: t("common.cancel"), style: "cancel" as const };
    const send = { text: t("common.share"), onPress: () => void share() };
    Alert.alert(
      t("tripShare.title"),
      t(token ? "tripShare.active" : "tripShare.create"),
      token
        ? [
            cancel,
            {
              text: t("tripShare.revoke"),
              style: "destructive",
              onPress: () => stopSharing(token),
            },
            send,
          ]
        : [cancel, send],
    );
  };

  return {
    open,
    loading: token === undefined,
    revokeActive: token ? () => stopSharing(token) : null,
  };
}
