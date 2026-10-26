import { analytics } from "@/lib/analytics";
import { isDarkThemeName } from "@/lib/appearance";
import { appleZoom } from "@/lib/city-pins";
import { fitCamera } from "@/lib/trip";
import { AppleMaps, GoogleMaps } from "expo-maps";
import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

export type MapPin = {
  id: string;
  name: string;
  lat: number;
  lng: number;
};

type Props = {
  pins: MapPin[];
  /** The places the first camera frames when it cannot open on the person. */
  framed: MapPin[];
  /** iOS: open on the person's location and show it. */
  showsUser: boolean;
  /** Clears the floating filter row above the map. */
  topInset: number;
  onSelect: (id: string) => void;
};

export function PlacesMap({
  pins,
  framed,
  showsUser,
  topInset,
  onSelect,
}: Props) {
  const { theme, rt } = useUnistyles();
  const ref = useRef<AppleMaps.MapView>(null);
  const { width, height } = rt.screen;

  const fit = useMemo(() => {
    const camera = fitCamera(
      framed.map((pin) => ({ latitude: pin.lat, longitude: pin.lng })),
      {
        width,
        height,
        top: topInset,
        bottom: rt.insets.bottom + theme.gap(10),
        worldWidth: 256,
        centerY: height / 2,
      },
    );
    return camera && process.env.EXPO_OS === "ios"
      ? {
          ...camera,
          zoom: appleZoom(
            camera.zoom,
            camera.coordinates.latitude,
            width,
            height,
          ),
        }
      : camera;
  }, [framed, width, height, topInset, rt.insets.bottom, theme]);

  // expo-maps applies a cameraPosition prop without animation, so it only ever holds the first camera.
  const [firstCamera] = useState(showsUser ? undefined : fit);
  const centredOnUser = useRef(false);
  useEffect(() => {
    if (!showsUser || centredOnUser.current) return;
    centredOnUser.current = true;
    // No position means the person's own location.
    ref.current
      ?.setCameraPosition()
      .catch((error: unknown) =>
        analytics.captureError("places_map_camera_failed", error),
      );
  }, [showsUser]);

  const select = (id: string | undefined) => {
    if (id) onSelect(id);
  };

  if (process.env.EXPO_OS === "ios") {
    return (
      <AppleMaps.View
        ref={ref}
        style={styles.map}
        cameraPosition={firstCamera}
        colorScheme={
          isDarkThemeName(rt.themeName)
            ? AppleMaps.MapColorScheme.DARK
            : AppleMaps.MapColorScheme.LIGHT
        }
        properties={{ isMyLocationEnabled: showsUser }}
        uiSettings={{
          compassEnabled: false,
          myLocationButtonEnabled: showsUser,
        }}
        markers={pins.map((pin) => ({
          id: pin.id,
          coordinates: { latitude: pin.lat, longitude: pin.lng },
          title: pin.name,
          tintColor: theme.colors.primary,
        }))}
        onMarkerClick={(marker) => select(marker.id)}
      />
    );
  }
  return (
    <GoogleMaps.View
      style={styles.map}
      cameraPosition={firstCamera}
      markers={pins.map((pin) => ({
        id: pin.id,
        coordinates: { latitude: pin.lat, longitude: pin.lng },
        title: pin.name,
      }))}
      onMarkerClick={(marker) => select(marker.id)}
    />
  );
}

const styles = StyleSheet.create({
  map: { ...StyleSheet.absoluteFillObject },
});
