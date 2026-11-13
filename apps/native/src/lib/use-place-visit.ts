import { analytics } from "@/lib/analytics";
import { openPaywall } from "@/lib/entitlement";
import { haptics } from "@/lib/haptics";
import { t } from "@/lib/i18n";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { isRateLimitedError } from "@convex/model/demoErrors";
import type { Placed } from "@convex/model/placeIdentity";
import type { VisitMark } from "@convex/model/placeVisits";
import { saveErrorCode } from "@convex/model/saveErrors";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Alert } from "react-native";

const NO_VISITS: readonly VisitMark[] = [];

export function usePlaceVisits(): {
  visits: readonly VisitMark[];
  loaded: boolean;
  isError: boolean;
  offerRetry: () => void;
} {
  const query = useQuery(convexQuery(api.placeVisits.listVisits, {}));
  const { refetch } = query;
  const offerRetry = useCallback(
    () =>
      Alert.alert(t("errors.unexpectedTitle"), t("errors.retrySoon"), [
        { text: t("common.cancel"), style: "cancel" },
        { text: t("common.retry"), onPress: () => void refetch() },
      ]),
    [refetch],
  );
  return {
    visits: query.data ?? NO_VISITS,
    loaded: query.data !== undefined,
    isError: query.isError,
    offerRetry,
  };
}

export function usePlaceVisit() {
  const router = useRouter();
  const setVisited = useMutation(api.placeVisits.setVisited);
  const working = useRef(false);
  const [busy, setBusy] = useState(false);
  const toggle = async (itemId: Id<"items">, pin: Placed, visited: boolean) => {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    try {
      await setVisited({
        itemId,
        name: pin.name,
        visited,
        spot: {
          lat: pin.lat,
          lng: pin.lng,
          ...(pin.appleId === undefined ? {} : { appleId: pin.appleId }),
        },
      });
      void (visited ? haptics.success() : haptics.selection());
      analytics.capture("city_place_visited", { visited });
    } catch (error) {
      if (saveErrorCode(error) === "pro_required") {
        await openPaywall(router, "mark_visited");
        return;
      }
      if (isRateLimitedError(error)) {
        Alert.alert(t("cityProgress.rateLimited"));
        return;
      }
      analytics.captureError("place_visit_failed", error);
      Alert.alert(t("errors.unexpectedTitle"), t("errors.retrySoon"));
    } finally {
      working.current = false;
      setBusy(false);
    }
  };
  return { busy, toggle };
}
