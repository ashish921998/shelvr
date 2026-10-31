import { analytics } from "@/lib/analytics";
import { getPermissionsAsync, requestPermissionsAsync } from "expo-maps";
import { useEffect, useState } from "react";

type MapLocation = "asking" | "granted" | "denied";

/**
 * Whether the Map tab may open on the person's location. iOS asks once, the first time the tab
 * opens; Android opens on the busiest city instead. Native tabs mount every tab at launch, so the
 * screen passes `opened` and nothing is asked before the person looks at the map.
 */
export function useMapLocation(opened: boolean): MapLocation {
  const [state, setState] = useState<MapLocation>(
    process.env.EXPO_OS === "ios" ? "asking" : "denied",
  );
  useEffect(() => {
    if (process.env.EXPO_OS !== "ios" || !opened) return;
    let live = true;
    void (async () => {
      try {
        let permission = await getPermissionsAsync();
        if (!permission.granted && permission.canAskAgain)
          permission = await requestPermissionsAsync();
        if (live) setState(permission.granted ? "granted" : "denied");
      } catch (error) {
        analytics.captureError("map_location_failed", error);
        if (live) setState("denied");
      }
    })();
    return () => {
      live = false;
    };
  }, [opened]);
  return state;
}
