import { analytics } from "@/lib/analytics";
import { isDarkThemeName } from "@/lib/appearance";
import { appleZoom } from "@/lib/city-pins";
import { moveCamera } from "@/lib/map-camera";
import { hasPlaceNear } from "@/lib/map-filters";
import { fitCamera } from "@/lib/trip";
import type { LatLng } from "@convex/model/trip";
import { AppleMaps, GoogleMaps } from "expo-maps";
import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

/** How long the camera must rest after moving to the person before the map checks what is near. */
const SETTLE_MS = 600;
/** After this, the opening check is dropped so it never pulls back a camera the person moved. */
const DISARM_MS = 3000;

export type MapPin = {
  id: string;
  name: string;
  lat: number;
  lng: number;
};

/** A place the camera flies to; a new key moves it again even to the same spot. */
export type MapFocus = LatLng & { key: number };

/** How close the camera comes to a place picked from search. */
const FOCUS_ZOOM = 15;

type Props = {
  pins: MapPin[];
  /** The places the first camera frames when it cannot open on the person. */
  framed: MapPin[];
  /** iOS: open on the person's location and show it. */
  showsUser: boolean;
  /** Clears the floating filter row above the map. */
  topInset: number;
  focus?: MapFocus;
  onSelect: (id: string) => void;
};

export function PlacesMap({
  pins,
  framed,
  showsUser,
  topInset,
  focus,
  onSelect,
}: Props) {
  const { theme, rt } = useUnistyles();
  const appleRef = useRef<AppleMaps.MapView>(null);
  const googleRef = useRef<GoogleMaps.MapView>(null);
  // Whichever map this platform rendered.
  const map = () => appleRef.current ?? googleRef.current;
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
  // The opening check reads these when it fires, so a filter picked while it waits is the one it frames.
  const latest = useRef({ pins, fit });
  useEffect(() => {
    latest.current = { pins, fit };
  }, [pins, fit]);
  const centredOnUser = useRef(false);
  const centre = useRef<LatLng | undefined>(undefined);
  const settle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Set while the camera travels to the person; once it rests, a map with none of their places in
  // reach moves on to the city they saved the most in.
  const checkNearby = useRef<(() => void) | undefined>(undefined);
  const waitForRest = () => {
    clearTimeout(settle.current);
    settle.current = setTimeout(() => checkNearby.current?.(), SETTLE_MS);
  };
  useEffect(() => {
    if (!showsUser || centredOnUser.current) return;
    centredOnUser.current = true;
    const showCity = () => {
      const { fit } = latest.current;
      if (fit)
        map()
          ?.setCameraPosition(fit)
          .catch((error: unknown) =>
            analytics.captureError("places_map_camera_failed", error),
          );
    };
    checkNearby.current = () => {
      checkNearby.current = undefined;
      if (!hasPlaceNear(centre.current, latest.current.pins)) showCity();
    };
    // No position means the person's own location. A map mounted moments ago can refuse its first
    // move, so it is retried; if every try fails, the map shows the busiest city instead.
    const cancel = moveCamera(
      () => map()?.setCameraPosition().then(waitForRest),
      (error) => {
        checkNearby.current = undefined;
        analytics.captureError("places_map_camera_failed", error);
        showCity();
      },
    );
    // Only the opening move may be redirected; a later pan or my-location tap is the person's own.
    const disarm = setTimeout(() => {
      checkNearby.current = undefined;
    }, DISARM_MS);
    return () => {
      cancel();
      clearTimeout(disarm);
      checkNearby.current = undefined;
      centredOnUser.current = false;
    };
  }, [showsUser]);
  useEffect(() => () => clearTimeout(settle.current), []);
  useEffect(() => {
    if (!focus) return;
    // A place the person picked wins over the opening check.
    checkNearby.current = undefined;
    return moveCamera(
      () =>
        map()?.setCameraPosition({
          coordinates: { latitude: focus.lat, longitude: focus.lng },
          zoom: FOCUS_ZOOM,
        }),
      (error) => analytics.captureError("places_map_camera_failed", error),
    );
  }, [focus]);

  // A new filter whose places are all out of reach brings them into view. While the opening move is
  // still deciding where to go, its check frames the new filter instead. Search does not refit:
  // picking a result flies to it. Keyed on the places, so a layout change (the keyboard) never moves
  // the camera, and an empty map (a search with no match) stays where it is.
  const fitted = useRef(framed);
  useEffect(() => {
    if (framed === fitted.current) return;
    fitted.current = framed;
    if (
      !fit ||
      pins.length === 0 ||
      checkNearby.current ||
      hasPlaceNear(centre.current, pins)
    )
      return;
    map()
      ?.setCameraPosition(fit)
      .catch((error: unknown) =>
        analytics.captureError("places_map_camera_failed", error),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a new framing moves the camera; search narrowing pins must not
  }, [framed]);

  const select = (id: string | undefined) => {
    if (id) onSelect(id);
  };
  const trackCamera = (event: {
    coordinates: { latitude?: number; longitude?: number };
  }) => {
    const { latitude, longitude } = event.coordinates;
    centre.current =
      latitude !== undefined && longitude !== undefined
        ? { lat: latitude, lng: longitude }
        : undefined;
    if (checkNearby.current) waitForRest();
  };

  if (process.env.EXPO_OS === "ios") {
    return (
      <AppleMaps.View
        ref={appleRef}
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
        onCameraMove={trackCamera}
      />
    );
  }
  return (
    <GoogleMaps.View
      ref={googleRef}
      style={styles.map}
      cameraPosition={firstCamera}
      markers={pins.map((pin) => ({
        id: pin.id,
        coordinates: { latitude: pin.lat, longitude: pin.lng },
        title: pin.name,
      }))}
      onMarkerClick={(marker) => select(marker.id)}
      onCameraMove={trackCamera}
    />
  );
}

const styles = StyleSheet.create({
  map: { ...StyleSheet.absoluteFillObject },
});
