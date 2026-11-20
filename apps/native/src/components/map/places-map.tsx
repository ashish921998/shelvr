import { analytics } from "@/lib/analytics";
import { isDarkThemeName } from "@/lib/appearance";
import { appleZoom } from "@/lib/city-pins";
import {
  type CameraView,
  type MapBox,
  sameBox,
  visibleBox,
  withReach,
} from "@/lib/discover-area";
import { moveCamera } from "@/lib/map-camera";
import { hasPlaceNear, NEARBY_KM } from "@/lib/map-filters";
import { type MapPin } from "@/lib/map-pin-clusters";
import { useMapPinClusters } from "@/lib/use-map-pin-clusters";
import { fitCamera } from "@/lib/trip";
import type { LatLng } from "@convex/model/trip";
import { AppleMaps, GoogleMaps } from "expo-maps";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
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
const AREA_REST_MS = 400;
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
  anchors: LatLng[] | undefined;
  areaPartial: boolean;
  /** iOS: open on the person's location and show it. */
  showsUser: boolean;
  height: number;
  topInset: number;
  bottomInset: number;
  focus?: MapFocus;
  locate?: number;
  overview?: MapPin[];
  zoomOut?: number;
  filterRevision?: number;
  onCentreChange?: (centre: LatLng, zoom: number) => void;
  onSelect: (id: string) => void;
  onArea: (box: MapBox) => void;
};

export function PlacesMap({
  pins,
  framed,
  anchors,
  areaPartial,
  showsUser,
  height,
  topInset,
  bottomInset,
  focus,
  locate,
  overview,
  zoomOut,
  filterRevision = 0,
  onCentreChange,
  onSelect,
  onArea,
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
  const overviewCamera = useMemo(
    () => (overview ? cameraFor(overview) : undefined),
    [cameraFor, overview],
  );
  const latest = useRef({ anchors, areaPartial, fit, overviewCamera });
  const centredOnUser = useRef(false);
  const framedOnce = useRef(showsUser || firstCamera !== undefined);
  const touched = useRef(false);
  const onFit = useRef(firstCamera !== undefined);
  const fittedInset = useRef(bottomInset);
  const centre = useRef<LatLng | undefined>(undefined);
  const settle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Set while the camera travels to the person; once it rests and the places in reach have loaded, a
  // map with none of them moves on to the busiest city.
  const checkNearby = useRef<(() => void) | undefined>(undefined);
  const rested = useRef(false);
  const cameraCommand = useRef<(() => void) | undefined>(undefined);
  const command = useCallback(
    (
      move: () => Promise<void> | undefined,
      onFail: (error: unknown) => void,
    ) => {
      cameraCommand.current?.();
      const cancel = moveCamera(move, onFail);
      cameraCommand.current = cancel;
      return cancel;
    },
    [],
  );
  useEffect(() => {
    latest.current = { anchors, areaPartial, fit, overviewCamera };
    if (anchors !== undefined && rested.current) checkNearby.current?.();
  }, [anchors, areaPartial, fit, overviewCamera]);
  const waitForRest = () => {
    clearTimeout(settle.current);
    rested.current = false;
    settle.current = setTimeout(() => {
      rested.current = true;
      checkNearby.current?.();
    }, SETTLE_MS);
  };
  useEffect(() => {
    if (!showsUser || centredOnUser.current || filterRevision > 0) return;
    centredOnUser.current = true;
    const showCity = () => {
      const { fit } = latest.current;
      if (!fit) framedOnce.current = false;
      else
        map()
          ?.setCameraPosition(fit)
          .then(() => {
            onFit.current = true;
          })
          .catch((error: unknown) =>
            analytics.captureError("places_map_camera_failed", error),
          );
    };
    checkNearby.current = () => {
      const { anchors, areaPartial } = latest.current;
      if (anchors === undefined) return;
      checkNearby.current = undefined;
      if (!areaPartial && !hasPlaceNear(centre.current, anchors)) showCity();
    };
    // No position means the person's own location. A map mounted moments ago can refuse its first
    // move, so it is retried; if every try fails, the map shows the busiest city instead.
    const cancel = command(
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
  }, [showsUser, filterRevision, command]);
  const areaTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const reportedArea = useRef<MapBox | undefined>(undefined);
  const reportArea = useCallback(
    (camera: CameraView) => {
      const visible = visibleBox(camera, {
        width,
        height,
        apple: process.env.EXPO_OS === "ios",
      });
      if (!visible) return;
      const box = checkNearby.current
        ? withReach(visible, camera, NEARBY_KM)
        : visible;
      if (sameBox(box, reportedArea.current)) return;
      reportedArea.current = box;
      onArea(box);
    },
    [width, height, onArea],
  );
  const seeded = useRef(false);
  useEffect(() => {
    if (!firstCamera || seeded.current) return;
    seeded.current = true;
    reportArea({ ...firstCamera.coordinates, zoom: firstCamera.zoom });
  }, [firstCamera, reportArea]);
  useEffect(
    () => () => {
      clearTimeout(settle.current);
      clearTimeout(areaTimer.current);
    },
    [],
  );
  useEffect(() => {
    if (!focus) return;
    // A place the person picked wins over the opening check.
    checkNearby.current = undefined;
    onFit.current = false;
    return command(
      () =>
        map()?.setCameraPosition({
          coordinates: { latitude: focus.lat, longitude: focus.lng },
          zoom: FOCUS_ZOOM,
        }),
      (error) => analytics.captureError("places_map_camera_failed", error),
    );
  }, [focus, command]);

  useEffect(() => {
    if (!zoomOut) return;
    checkNearby.current = undefined;
    onFit.current = false;
    const camera = latest.current.overviewCamera;
    if (!camera) return;
    return command(
      () => map()?.setCameraPosition(camera),
      (error) => analytics.captureError("places_map_camera_failed", error),
    );
  }, [zoomOut, command]);

  useEffect(() => {
    if (!locate) return;
    checkNearby.current = undefined;
    onFit.current = false;
    return command(
      () => map()?.setCameraPosition(),
      (error) => analytics.captureError("places_map_camera_failed", error),
    );
  }, [locate, command]);

  const canFrameLatePlaces =
    filterRevision === 0 &&
    !focus &&
    !locate &&
    !zoomOut &&
    !!fit &&
    (!showsUser || anchors !== undefined);
  useEffect(() => {
    const initialFit = latest.current.fit;
    if (framedOnce.current || !canFrameLatePlaces || !initialFit) return;
    framedOnce.current = true;
    if (showsUser && hasPlaceNear(centre.current, latest.current.anchors ?? []))
      return;
    return command(
      () =>
        map()
          ?.setCameraPosition(latest.current.fit ?? initialFit)
          .then(() => {
            onFit.current = true;
          }),
      (error) => analytics.captureError("places_map_camera_failed", error),
    );
  }, [canFrameLatePlaces, showsUser, command]);

  useEffect(() => {
    if (fittedInset.current === bottomInset) return;
    fittedInset.current = bottomInset;
    const { fit } = latest.current;
    if (!onFit.current || touched.current || filterRevision > 0 || !fit) return;
    return command(
      () =>
        onFit.current && !touched.current
          ? map()?.setCameraPosition(fit)
          : undefined,
      (error) => analytics.captureError("places_map_camera_failed", error),
    );
  }, [bottomInset, filterRevision, command]);

  const trackCamera = (event: {
    coordinates: { latitude?: number; longitude?: number };
    zoom: number;
    tilt: number;
    latitudeDelta: number;
    longitudeDelta: number;
  }) => {
    clustered.trackZoom(event.zoom);
    const { latitude, longitude } = event.coordinates;
    centre.current =
      latitude !== undefined && longitude !== undefined
        ? { lat: latitude, lng: longitude }
        : undefined;
    if (centre.current) onCentreChange?.(centre.current, event.zoom);
    if (checkNearby.current) waitForRest();
    else if (showsUser && touched.current) framedOnce.current = true;
    clearTimeout(areaTimer.current);
    if (latitude === undefined || longitude === undefined) return;
    const { zoom, tilt, latitudeDelta, longitudeDelta } = event;
    areaTimer.current = setTimeout(
      () =>
        reportArea({
          latitude,
          longitude,
          zoom,
          tilt,
          latitudeDelta,
          longitudeDelta,
        }),
      AREA_REST_MS,
    );
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
      <View
        style={styles.map}
        onTouchStart={() => {
          touched.current = true;
          onFit.current = false;
        }}
      >
        {nativeMap}
      </View>
      {clustered.sheet}
    </>
  );
}

const styles = StyleSheet.create({
  map: { ...StyleSheet.absoluteFillObject },
});
