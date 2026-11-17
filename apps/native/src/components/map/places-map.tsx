import { analytics } from "@/lib/analytics";
import { isDarkThemeName } from "@/lib/appearance";
import { appleZoom } from "@/lib/city-pins";
import { moveCamera } from "@/lib/map-camera";
import { CITY_ZOOM } from "@/lib/map-city-zoom";
import { hasPlaceNear } from "@/lib/map-filters";
import { type MapPin } from "@/lib/map-pin-clusters";
import { useMapPinClusters } from "@/lib/use-map-pin-clusters";
import { fitCamera } from "@/lib/trip";
import type { LatLng } from "@convex/model/trip";
import { AppleMaps, GoogleMaps } from "expo-maps";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

const LANDMARKS = [
  AppleMaps.PointOfInterestCategory.LANDMARK,
  AppleMaps.PointOfInterestCategory.MUSEUM,
  AppleMaps.PointOfInterestCategory.CASTLE,
  AppleMaps.PointOfInterestCategory.FORTRESS,
  AppleMaps.PointOfInterestCategory.PARK,
];

/** How long the camera must rest after moving to the person before the map checks what is near. */
const SETTLE_MS = 600;
/** After this, the opening check is dropped so it never pulls back a camera the person moved. */
const DISARM_MS = 3000;

export type { MapPin } from "@/lib/map-pin-clusters";

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
  height: number;
  topInset: number;
  bottomInset: number;
  focus?: MapFocus;
  locate?: number;
  overview?: MapPin[];
  zoomOut?: number;
  onCentreChange?: (centre: LatLng, zoom: number) => void;
  onSelect: (id: string) => void;
};

export function PlacesMap({
  pins,
  framed,
  showsUser,
  height,
  topInset,
  bottomInset,
  focus,
  locate,
  overview,
  zoomOut,
  onCentreChange,
  onSelect,
}: Props) {
  const { rt } = useUnistyles();
  const appleRef = useRef<AppleMaps.MapView>(null);
  const googleRef = useRef<GoogleMaps.MapView>(null);
  // Whichever map this platform rendered.
  const map = () => appleRef.current ?? googleRef.current;
  const { width } = rt.screen;
  const clustered = useMapPinClusters(pins, onSelect, {
    clearSelection: () => appleRef.current?.selectMarker(undefined),
  });

  const cameraFor = useCallback(
    (points: MapPin[]) => {
      const camera = fitCamera(
        points.map((pin) => ({ latitude: pin.lat, longitude: pin.lng })),
        {
          width,
          height,
          top: topInset,
          bottom: bottomInset,
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
    },
    [width, height, topInset, bottomInset],
  );
  const fit = useMemo(() => cameraFor(framed), [cameraFor, framed]);

  // expo-maps applies a cameraPosition prop without animation, so it only ever holds the first camera.
  const [firstCamera] = useState(showsUser ? undefined : fit);
  // The opening check reads these when it fires, so a filter picked while it waits is the one it frames.
  const overviewCamera = useMemo(
    () => (overview ? cameraFor(overview) : undefined),
    [cameraFor, overview],
  );
  const latest = useRef({ pins, fit, overviewCamera });
  useEffect(() => {
    latest.current = { pins, fit, overviewCamera };
  }, [pins, fit, overviewCamera]);
  const centredOnUser = useRef(false);
  const centre = useRef<LatLng | undefined>(undefined);
  const settle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Set while the camera travels to the person; once it rests, a map with none of their places in
  // reach moves on to the city they saved the most in.
  const checkNearby = useRef<(() => void) | undefined>(undefined);
  const cancelOpening = useRef<(() => void) | undefined>(undefined);
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
    cancelOpening.current = cancel;
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
    cancelOpening.current?.();
    return moveCamera(
      () =>
        map()?.setCameraPosition({
          coordinates: { latitude: focus.lat, longitude: focus.lng },
          zoom: FOCUS_ZOOM,
        }),
      (error) => analytics.captureError("places_map_camera_failed", error),
    );
  }, [focus]);

  useEffect(() => {
    if (!zoomOut) return;
    checkNearby.current = undefined;
    cancelOpening.current?.();
    const camera = latest.current.overviewCamera;
    if (!camera) return;
    return moveCamera(
      () => map()?.setCameraPosition(camera),
      (error) => analytics.captureError("places_map_camera_failed", error),
    );
  }, [zoomOut]);

  useEffect(() => {
    if (!locate) return;
    checkNearby.current = undefined;
    cancelOpening.current?.();
    return moveCamera(
      () => map()?.setCameraPosition(),
      (error) => analytics.captureError("places_map_camera_failed", error),
    );
  }, [locate]);

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

  const trackCamera = (event: {
    coordinates: { latitude?: number; longitude?: number };
    zoom?: number;
  }) => {
    clustered.trackZoom(event.zoom);
    const { latitude, longitude } = event.coordinates;
    centre.current =
      latitude !== undefined && longitude !== undefined
        ? { lat: latitude, lng: longitude }
        : undefined;
    if (centre.current)
      onCentreChange?.(centre.current, event.zoom ?? CITY_ZOOM);
    if (checkNearby.current) waitForRest();
  };

  const nativeMap =
    process.env.EXPO_OS === "ios" ? (
      <AppleMaps.View
        ref={appleRef}
        style={styles.map}
        cameraPosition={firstCamera}
        colorScheme={
          isDarkThemeName(rt.themeName)
            ? AppleMaps.MapColorScheme.DARK
            : AppleMaps.MapColorScheme.LIGHT
        }
        properties={{
          isMyLocationEnabled: showsUser,
          emphasis: "MUTED" as AppleMaps.MapProperties["emphasis"],
          pointsOfInterest: { including: LANDMARKS },
        }}
        uiSettings={{
          compassEnabled: false,
          myLocationButtonEnabled: false,
          togglePitchEnabled: false,
        }}
        markers={clustered.markers}
        onMarkerClick={(marker) => clustered.select(marker.id)}
        onCameraMove={trackCamera}
      />
    ) : (
      <GoogleMaps.View
        ref={googleRef}
        style={styles.map}
        cameraPosition={firstCamera}
        markers={clustered.markers}
        onMarkerClick={(marker) => clustered.select(marker.id)}
        onCameraMove={trackCamera}
      />
    );
  return (
    <>
      {nativeMap}
      {clustered.sheet}
    </>
  );
}

const styles = StyleSheet.create({
  map: { ...StyleSheet.absoluteFillObject },
});
