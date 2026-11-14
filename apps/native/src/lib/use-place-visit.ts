import { analytics } from "@/lib/analytics";
import { openPaywall } from "@/lib/entitlement";
import { haptics } from "@/lib/haptics";
import { t } from "@/lib/i18n";
import {
  placeStampMoment,
  type StampPlace,
  useStampMoment,
} from "@/lib/stamp-moment";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { isRateLimitedError } from "@convex/model/demoErrors";
import type { VisitMark } from "@convex/model/placeVisits";
import { saveErrorCode } from "@convex/model/saveErrors";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { useNavigation, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Alert } from "react-native";

const NO_VISITS: readonly VisitMark[] = [];

export function usePlaceVisits(): {
  visits: readonly VisitMark[];
  loaded: boolean;
  isError: boolean;
  error: Error | null;
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
    error: query.error,
    offerRetry,
  };
}

type VisitPlace = {
  name: string;
  lat?: number;
  lng?: number;
  appleId?: string;
};

export function usePlaceVisit(surface: "city" | "passport" = "city") {
  const router = useRouter();
  const navigation = useNavigation();
  const setVisited = useMutation(api.placeVisits.setVisited);
  const { play: playStamp } = useStampMoment();
  const working = useRef(false);
  const [busy, setBusy] = useState(false);
  const toggle = async (
    itemId: Id<"items">,
    place: VisitPlace,
    visited: boolean,
    stamp?: StampPlace,
  ): Promise<boolean> => {
    if (working.current) return false;
    working.current = true;
    setBusy(true);
    try {
      const { name, lat, lng, appleId } = place;
      await setVisited({
        itemId,
        name,
        visited,
        ...(lat === undefined || lng === undefined
          ? {}
          : {
              spot: {
                lat,
                lng,
                ...(appleId === undefined ? {} : { appleId }),
              },
            }),
      });
      if (!visited) void haptics.selection();
      else if (navigation.isFocused()) {
        playStamp(placeStampMoment(name, stamp), "city");
      }
      if (surface === "passport") {
        analytics.capture("place_unstamped", { surface });
      } else {
        analytics.capture("city_place_visited", { visited });
      }
      return true;
    } catch (error) {
      if (saveErrorCode(error) === "pro_required") {
        await openPaywall(router, "mark_visited");
        return false;
      }
      if (isRateLimitedError(error)) {
        Alert.alert(t("cityProgress.rateLimited"));
        return false;
      }
      analytics.captureError("place_visit_failed", error, { surface });
      Alert.alert(t("errors.unexpectedTitle"), t("errors.retrySoon"));
      return false;
    } finally {
      working.current = false;
      setBusy(false);
    }
  };
  return { busy, toggle };
}
