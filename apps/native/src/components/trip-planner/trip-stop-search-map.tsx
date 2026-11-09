import { analytics } from "@/lib/analytics";
import { isDarkThemeName } from "@/lib/appearance";
import { moveCamera, sameCamera } from "@/lib/map-camera";
import { fitCamera } from "@/lib/trip";
import type { TripPlace } from "@convex/model/tripPlan";
import { AppleMaps, GoogleMaps } from "expo-maps";
import { useEffect, useRef, useState } from "react";
import { useWindowDimensions, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

export type StopSearchPin = Pick<TripPlace, "name" | "lat" | "lng"> & {
  id: string;
  source: "trip" | "save" | "search";
};

const PIN_LIMIT = 12;

export function TripStopSearchMap({
  places,
  context,
}: {
  places: StopSearchPin[];
  context: StopSearchPin[];
}) {
  const { theme, rt } = useUnistyles();
  const { width, height } = useWindowDimensions();
  const mapHeight = Math.max(104, Math.min(152, height * 0.19));
  const ref = useRef<AppleMaps.MapView>(null);
  const colors = {
    trip: theme.colors.muted,
    save: theme.colors.primaryText,
    search: theme.colors.keep,
  };
  const markers = (places.length ? places : context)
    .slice(0, PIN_LIMIT)
    .map((pin) => ({
      id: pin.id,
      title: pin.name,
      coordinates: { latitude: pin.lat, longitude: pin.lng },
      systemImage: pin.source === "save" ? "bookmark.fill" : "mappin",
      tintColor: colors[pin.source],
    }));
  const ios = process.env.EXPO_OS === "ios";
  const fit = fitCamera(
    markers.map((marker) => marker.coordinates),
    {
      width,
      height: mapHeight,
      top: 24,
      bottom: 30,
      worldWidth: ios ? width : 256,
      centerY: mapHeight / 2,
    },
  );
  const [camera, setCamera] = useState(fit);
  if (fit && !sameCamera(camera, fit)) setCamera(fit);
  const [initialCamera] = useState(camera);
  useEffect(() => {
    if (!ios || !camera || camera === initialCamera) return;
    return moveCamera(
      () => ref.current?.setCameraPosition(camera),
      (error) =>
        analytics.captureError("trip_stop_search_camera_failed", error),
    );
  }, [camera, initialCamera, ios]);

  return (
    <View style={[styles.map, { height: mapHeight }]}>
      {ios ? (
        <AppleMaps.View
          ref={ref}
          style={styles.fill}
          cameraPosition={initialCamera}
          markers={markers}
          colorScheme={
            isDarkThemeName(rt.themeName)
              ? AppleMaps.MapColorScheme.DARK
              : AppleMaps.MapColorScheme.LIGHT
          }
          uiSettings={{ compassEnabled: false, myLocationButtonEnabled: false }}
        />
      ) : (
        <GoogleMaps.View
          style={styles.fill}
          cameraPosition={camera}
          markers={markers}
          uiSettings={{ compassEnabled: false, myLocationButtonEnabled: false }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  map: { backgroundColor: theme.colors.surfaceMuted, overflow: "hidden" },
  fill: { flex: 1 },
}));
