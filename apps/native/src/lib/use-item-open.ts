import { analytics, type AnalyticsItem } from "@/lib/analytics";
import { useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { AppState } from "react-native";

export function useItemOpen(
  item: (AnalyticsItem & { status: string }) | undefined,
  source: string,
  markOpened: (args: { itemId: string }) => Promise<unknown>,
) {
  const id = item?._id;
  const savedAt = item?._creationTime;
  const type = item?.type;
  const ready = item?.status === "ready";
  const fixtureKey = item?.fixtureKey;

  useFocusEffect(
    useCallback(() => {
      if (!id || savedAt === undefined || !type || !ready) return;
      const record = () => {
        if (AppState.currentState !== "active") return;
        // Only the focused pager's active item calls this, never preloaded pages.
        analytics.itemOpened(
          { _id: id, _creationTime: savedAt, type, fixtureKey },
          source,
        );
        void markOpened({ itemId: id }).catch(() => {});
      };
      record();
      const subscription = AppState.addEventListener("change", record);
      return () => {
        subscription.remove();
      };
    }, [id, savedAt, type, ready, fixtureKey, source, markOpened]),
  );
}
