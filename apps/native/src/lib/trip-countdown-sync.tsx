import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useConvexAuth } from "convex/react";
import { Directory, File } from "expo-file-system";
import { requireOptionalNativeModule } from "expo-modules-core";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { Platform } from "react-native";

import { analytics } from "@/lib/analytics";
import { useAppLocale } from "@/lib/i18n";
import { toDateKey } from "@/lib/trip";
import {
  type CountdownEntry,
  type CountdownTrip,
  countdownTimeline,
  timelineTrips,
} from "@/lib/trip-countdown";
import {
  deleteQuietly,
  ensureWidgetImage,
  WIDGET_IMAGE_TIMEOUT,
} from "@/lib/widget-image";
import { widgetScheme } from "@/lib/widget-scheme";
import { api } from "@convex/_generated/api";
import { cityKey } from "@convex/model/trip";

const IMAGE_PREFIX = "trip-countdown-";
const TRIP_PAGE = 50;
const CLEANUP_FAILED = "widget_thumbnail_cleanup_failed";

type City = { city: string; photo?: string; cover: string | null };

type Host = {
  directory: string;
  publish(entries: CountdownEntry[]): void;
};

let generation = 0;
let chain: Promise<unknown> = Promise.resolve();
let clears = 0;
const clearListeners = new Set<() => void>();

function onClear(listener: () => void) {
  clearListeners.add(listener);
  return () => {
    clearListeners.delete(listener);
  };
}

function clearCount() {
  return clears;
}

async function loadHost(): Promise<Host | null> {
  if (Platform.OS !== "ios") return null;
  if (!requireOptionalNativeModule("ExpoWidgets")) return null;
  const [{ widgetsDirectory }, { default: TripCountdownWidget }] =
    await Promise.all([
      import("expo-widgets"),
      import("@/widgets/trip-countdown-widget"),
    ]);
  return {
    directory: widgetsDirectory,
    publish: (entries) => TripCountdownWidget.updateTimeline(entries),
  };
}

function hash(text: string): string {
  let value = 5381;
  for (let i = 0; i < text.length; i++) {
    value = ((value << 5) + value + text.charCodeAt(i)) | 0;
  }
  return (value >>> 0).toString(36);
}

export function cityImageName(city: string, url: string): string {
  return `${IMAGE_PREFIX}${hash(`${cityKey(city)}|${url}`)}.jpg`;
}

function cityPhoto(cities: City[], city: string): string | undefined {
  const key = cityKey(city);
  const match = cities.find((entry) => cityKey(entry.city) === key);
  return match?.photo ?? match?.cover ?? undefined;
}

function tripImages(dir: Directory): File[] {
  return dir
    .list()
    .filter(
      (entry): entry is File =>
        entry instanceof File && entry.name.startsWith(IMAGE_PREFIX),
    );
}

function deleteCheckedImages(dir: Directory) {
  let failed = false;
  for (const file of tripImages(dir)) {
    try {
      file.delete();
      if (file.exists) failed = true;
    } catch {
      failed = true;
    }
  }
  if (failed) throw new Error(CLEANUP_FAILED);
}

async function fetchImage(
  dir: Directory,
  name: string,
  url: string,
): Promise<string | undefined> {
  try {
    return await ensureWidgetImage(dir, name, url, IMAGE_PREFIX);
  } catch (error) {
    analytics.capture("widget_sync_failed", {
      reason:
        error instanceof Error && error.message === WIDGET_IMAGE_TIMEOUT
          ? "timeout"
          : "error",
      widget: "trip_countdown",
    });
    return undefined;
  }
}

async function syncTripCountdown(
  trips: readonly CountdownTrip[],
  cities: City[],
  run: number,
): Promise<void> {
  if (run !== generation) return;
  const host = await loadHost();
  if (!host || run !== generation) return;
  const dir = new Directory(host.directory);
  if (!dir.exists) dir.create({ intermediates: true });

  const now = new Date();
  const images = new Map<string, string>();
  for (const trip of timelineTrips(trips, now)) {
    const url = cityPhoto(cities, trip.city);
    if (url === undefined) continue;
    const name = cityImageName(trip.city, url);
    if (images.has(name)) continue;
    const uri = await fetchImage(dir, name, url);
    if (run !== generation) return;
    if (uri !== undefined) images.set(name, uri);
  }

  host.publish(
    countdownTimeline(trips, now, widgetScheme(), (trip) => {
      const url = cityPhoto(cities, trip.city);
      return url === undefined
        ? undefined
        : images.get(cityImageName(trip.city, url));
    }),
  );
  for (const file of tripImages(dir)) {
    if (!images.has(file.name)) deleteQuietly(file);
  }
}

export function clearTripCountdownWidget(): Promise<void> {
  generation += 1;
  const run = chain.then(async () => {
    const host = await loadHost();
    if (!host) return;
    host.publish([{ date: new Date(), props: {} }]);
    const dir = new Directory(host.directory);
    if (dir.exists) deleteCheckedImages(dir);
  });
  chain = run.catch(() => {});
  return run.finally(() => {
    clears += 1;
    for (const listener of clearListeners) listener();
  });
}

export function TripCountdownWidgetSync() {
  const locale = useAppLocale();
  const { isAuthenticated } = useConvexAuth();
  const cleared = useSyncExternalStore(onClear, clearCount, clearCount);
  const enabled = Platform.OS === "ios" && isAuthenticated;
  const { data: trips } = useQuery(
    convexQuery(
      api.tripPlannerData.listTripPlans,
      enabled
        ? { paginationOpts: { numItems: TRIP_PAGE, cursor: null } }
        : "skip",
    ),
  );
  const { data: cities } = useQuery(
    convexQuery(api.items.listCities, enabled ? {} : "skip"),
  );
  const lastKey = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || trips === undefined || cities === undefined) return;
    const page = trips.page;
    const key = [
      cleared,
      locale,
      toDateKey(new Date()),
      ...page.map((trip) =>
        [
          trip._id,
          trip.name ?? "",
          trip.city,
          trip.startDate ?? "",
          trip.dayCount,
          trip.stopCount,
          trip.savedCount,
          cityPhoto(cities, trip.city) ?? "",
        ].join(":"),
      ),
    ].join("|");
    if (key === lastKey.current) return;
    lastKey.current = key;
    const run = generation;
    chain = chain
      .then(() => syncTripCountdown(page, cities, run))
      .catch((error) => {
        lastKey.current = null;
        console.warn("Trip countdown widget sync failed", error);
      });
  }, [enabled, trips, cities, locale, cleared]);

  return null;
}
