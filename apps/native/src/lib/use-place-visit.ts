import { analytics } from "@/lib/analytics";
import { openPaywall } from "@/lib/entitlement";
import { haptics } from "@/lib/haptics";
import { t } from "@/lib/i18n";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { saveErrorCode } from "@convex/model/saveErrors";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { useRouter } from "expo-router";
import { useMemo, useRef, useState } from "react";
import { Alert } from "react-native";

const EMPTY: ReadonlySet<string> = new Set();

export function useVisitedKeys(): ReadonlySet<string> {
  return useVisitedKeysState().keys;
}

export function useVisitedKeysState(): {
  keys: ReadonlySet<string>;
  loaded: boolean;
  isError: boolean;
} {
  const query = useQuery(convexQuery(api.placeVisits.visitedKeys, {}));
  const keys = useMemo(
    () => (query.data ? new Set(query.data) : EMPTY),
    [query.data],
  );
  return { keys, loaded: query.data !== undefined, isError: query.isError };
}

export function usePlaceVisit() {
  const router = useRouter();
  const setVisited = useMutation(api.placeVisits.setVisited);
  const working = useRef(false);
  const [busy, setBusy] = useState(false);
  const toggle = async (
    itemId: Id<"items">,
    name: string,
    visited: boolean,
  ) => {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    try {
      await setVisited({ itemId, name, visited });
      void (visited ? haptics.success() : haptics.selection());
      analytics.capture("city_place_visited", { visited });
    } catch (error) {
      if (saveErrorCode(error) === "pro_required") {
        await openPaywall(router, "mark_visited");
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
