import { analytics } from "@/lib/analytics";
import { isDarkThemeName } from "@/lib/appearance";
import {
  appleZoom,
  cityPinId,
  framedPins,
  type CityPin,
} from "@/lib/city-pins";
import { fitCamera } from "@/lib/trip";
import { AppleMaps, GoogleMaps } from "expo-maps";
import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

const SELECTED_ZOOM = 15;

type Props = {
  pins: CityPin[];
  selected: string | null;
  height: number;
  /** How much of the map's bottom the places sheet covers when the page opens. */
  coveredBottom: number;
  onSelect: (id: string) => void;
};

export function CityMap({
  pins,
  selected,
  height,
  coveredBottom,
  onSelect,
}: Props) {
  const { theme, rt } = useUnistyles();
  const ref = useRef<AppleMaps.MapView>(null);
  const { width } = rt.screen;

  const fit = useMemo(
    () =>
      fitCamera(
        framedPins(pins).map((pin) => ({
          latitude: pin.lat,
          longitude: pin.lng,
        })),
        {
          width,
          height,
          top: rt.insets.top + theme.gap(6),
          bottom: coveredBottom + theme.gap(3),
          worldWidth: 256,
          centerY: height / 2,
        },
      ),
    [pins, width, height, coveredBottom, rt.insets.top, theme],
  );
  const focus = useMemo(() => {
    const pin = pins.find((place) => cityPinId(place) === selected);
    return pin
      ? {
          coordinates: { latitude: pin.lat, longitude: pin.lng },
          zoom: SELECTED_ZOOM,
        }
      : undefined;
  }, [pins, selected]);
  const standard = focus ?? fit;
  const camera = useMemo(
    () =>
      standard && process.env.EXPO_OS === "ios"
        ? {
            ...standard,
            zoom: appleZoom(
              standard.zoom,
              standard.coordinates.latitude,
              width,
              height,
            ),
          }
        : standard,
    [standard, width, height],
  );

  // expo-maps applies every cameraPosition prop change without animation, so the prop holds only the first camera.
  const [firstCamera, setFirstCamera] = useState(camera);
  if (firstCamera === undefined && camera !== undefined) setFirstCamera(camera);
  useEffect(() => {
    if (!camera || camera === firstCamera) return;
    ref.current
      ?.setCameraPosition(camera)
      .catch((error: unknown) =>
        analytics.captureError("city_map_camera_failed", error),
      );
  }, [camera, firstCamera]);

  const annotations = pins.map((pin) => {
    const id = cityPinId(pin);
    const isSelected = id === selected;
    return {
      id,
      coordinates: { latitude: pin.lat, longitude: pin.lng },
      title: pin.name,
      text: String(pin.number),
      backgroundColor: isSelected
        ? theme.colors.foreground
        : theme.colors.primary,
      textColor: isSelected ? theme.colors.primary : theme.colors.onTint,
    };
  });
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
        uiSettings={{ compassEnabled: false, myLocationButtonEnabled: false }}
        annotations={annotations}
        onAnnotationClick={(pin) => select(pin.id)}
      />
    );
  }
  return (
    <GoogleMaps.View
      style={styles.map}
      cameraPosition={camera}
      markers={annotations.map((pin) => ({
        id: pin.id,
        coordinates: pin.coordinates,
        title: `${pin.text}. ${pin.title}`,
      }))}
      onMarkerClick={(marker) => select(marker.id)}
    />
  );
}

const styles = StyleSheet.create({
  map: { ...StyleSheet.absoluteFillObject },
});
