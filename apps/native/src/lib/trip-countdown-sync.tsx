import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { Directory, File } from "expo-file-system";
import { requireOptionalNativeModule } from "expo-modules-core";
import { useEffect, useRef } from "react";
import { Platform } from "react-native";

import { analytics } from "@/lib/analytics";
import { useAppLocale } from "@/lib/i18n";
import { toDateKey } from "@/lib/trip";
import {
  type CountdownEntry,
  type CountdownTrip,
  countdownTimeline,
  nextTrip,
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

type Host = {
  directory: string;
  publish(entries: CountdownEntry[]): void;
};

let generation = 0;
let chain: Promise<unknown> = Promise.resolve();

export function hasTripCountdownWidget(): boolean {
  return Platform.OS === "ios";
}

async function loadHost(): Promise<Host | null> {
  if (!hasTripCountdownWidget()) return null;
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

function deleteImages(dir: Directory, keep?: string) {
  for (const entry of dir.list()) {
    if (
      entry instanceof File &&
      entry.name.startsWith(IMAGE_PREFIX) &&
      entry.name !== keep
    ) {
      deleteQuietly(entry);
    }
  }
}

async function cityImage(
  dir: Directory,
  trip: CountdownTrip,
  url: string,
): Promise<string | undefined> {
  try {
    return await ensureWidgetImage(
      dir,
      cityImageName(trip.city, url),
      url,
      IMAGE_PREFIX,
    );
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
  trip: CountdownTrip | null,
  photoUrl: string | undefined,
  run: number,
): Promise<void> {
  if (run !== generation) return;
  const host = await loadHost();
  if (!host || run !== generation) return;
  const dir = new Directory(host.directory);
  if (!dir.exists) dir.create({ intermediates: true });
  const imageUri =
    trip !== null && photoUrl !== undefined
      ? await cityImage(dir, trip, photoUrl)
      : undefined;
  if (run !== generation) return;
  host.publish(
    countdownTimeline(trip, new Date(), { scheme: widgetScheme(), imageUri }),
  );
  deleteImages(
    dir,
    imageUri && trip && photoUrl
      ? cityImageName(trip.city, photoUrl)
      : undefined,
  );
}

export function clearTripCountdownWidget(): Promise<void> {
  generation += 1;
  const run = chain.then(async () => {
    const host = await loadHost();
    if (!host) return;
    host.publish([{ date: new Date(), props: {} }]);
    const dir = new Directory(host.directory);
    if (dir.exists) deleteImages(dir);
  });
  chain = run.catch(() => {});
  return run;
}

function cityPhoto(
  cities: { city: string; photo?: string; cover: string | null }[] | undefined,
  city: string | undefined,
): string | undefined {
  if (city === undefined) return undefined;
  const key = cityKey(city);
  const match = cities?.find((entry) => cityKey(entry.city) === key);
  return match?.photo ?? match?.cover ?? undefined;
}

export function TripCountdownWidgetSync() {
  const locale = useAppLocale();
  const enabled = hasTripCountdownWidget();
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
    const today = new Date();
    const trip = nextTrip(trips.page, today);
    const photoUrl = cityPhoto(cities, trip?.city);
    const key = [
      locale,
      toDateKey(today),
      trip
        ? [
            trip._id,
            trip.name ?? "",
            trip.city,
            trip.startDate,
            trip.dayCount,
            trip.stopCount,
            trip.savedCount,
          ].join(":")
        : "none",
      photoUrl ?? "",
    ].join("|");
    if (key === lastKey.current) return;
    lastKey.current = key;
    const run = generation;
    chain = chain
      .then(() => syncTripCountdown(trip, photoUrl, run))
      .catch((error) => {
        lastKey.current = null;
        console.warn("Trip countdown widget sync failed", error);
      });
  }, [enabled, trips, cities, locale]);

  return null;
}
