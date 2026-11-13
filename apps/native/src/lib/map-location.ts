import { analytics } from "@/lib/analytics";
import { getPermissionsAsync, requestPermissionsAsync } from "expo-maps";
import { useEffect, useState } from "react";
import { AppState } from "react-native";

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
    let latest = 0;
    let asking = false;
    const read = async (ask: boolean) => {
      if (asking) return;
      asking = ask;
      const id = ++latest;
      try {
        let permission = await getPermissionsAsync();
        if (!live || id !== latest) return;
        if (ask && !permission.granted && permission.canAskAgain)
          permission = await requestPermissionsAsync();
        if (live && id === latest)
          setState(permission.granted ? "granted" : "denied");
      } catch (error) {
        if (!live || id !== latest) return;
        analytics.captureError("map_location_failed", error);
        setState("denied");
      } finally {
        if (ask) asking = false;
      }
    };
    void read(true);
    const listener = AppState.addEventListener("change", (appState) => {
      if (appState === "active") void read(false);
    });
    return () => {
      live = false;
      listener.remove();
    };
  }, [opened]);
  return state;
}
