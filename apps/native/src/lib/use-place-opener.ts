import { analytics } from "@/lib/analytics";
import { cancelPlaceDetails, openPlaceDetails } from "@/lib/apple-place-card";
import type { StopAction } from "@/lib/trip-planner";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useRef } from "react";
import { Linking } from "react-native";

export function usePlaceCardFocus() {
  const focused = useRef(false);
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      return () => {
        focused.current = false;
        cancelPlaceDetails();
      };
    }, []),
  );
  return focused;
}

export function usePlaceOpener<Place>(
  actionFor: (place: Place, cardAvailable: boolean) => StopAction,
  mapsFailedEvent: string,
) {
  const router = useRouter();
  const focused = usePlaceCardFocus();
  const open = useCallback(
    (place: Place, first: StopAction) => {
      const go = (action: StopAction): void => {
        if (!focused.current) return;
        switch (action.kind) {
          case "save":
            router.push({
              pathname: "/item/[id]",
              params: { id: action.itemId },
            });
            return;
          case "card":
            void openPlaceDetails(action.appleId, () =>
              go(actionFor(place, false)),
            );
            return;
          case "maps":
            Linking.openURL(action.url).catch((error: unknown) =>
              analytics.captureError(mapsFailedEvent, error),
            );
        }
      };
      go(first);
    },
    [router, focused, actionFor, mapsFailedEvent],
  );
  return { focused, open };
}
