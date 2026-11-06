import { api } from "@convex/_generated/api";
import { analytics } from "@/lib/analytics";
import { bestEffort } from "@/lib/best-effort";
import { useCurrentUser } from "@/lib/current-user";
import { useOnboarding } from "@/lib/onboarding";
import { readSampleCities, type SampleCityId } from "@/lib/sample-cities";
import { useConvexAuth, useMutation } from "convex/react";
import * as SecureStore from "expo-secure-store";
import { useEffect, useRef } from "react";

const KEY = "shelvr.onboarding.beenCities";

type QueuedCities = { cities: SampleCityId[]; owner: string | null };

function readQueued(): QueuedCities | null {
  try {
    const raw = SecureStore.getItem(KEY);
    if (raw === null || raw === "") return null;
    const value = JSON.parse(raw) as Partial<QueuedCities> | null;
    const cities = readSampleCities(value?.cities);
    if (cities.length === 0) return null;
    return {
      cities,
      owner: typeof value?.owner === "string" ? value.owner : null,
    };
  } catch {
    return null;
  }
}

export function queueBeenCities(cities: readonly SampleCityId[]): void {
  bestEffort("queue_been_cities_failed", () =>
    SecureStore.setItem(
      KEY,
      cities.length === 0 ? "" : JSON.stringify({ cities, owner: null }),
    ),
  );
}

export function clearQueuedBeenCities(): void {
  bestEffort("clear_been_cities_failed", () => SecureStore.setItem(KEY, ""));
}

function claimQueued(queued: QueuedCities, owner: string): boolean {
  try {
    SecureStore.setItem(KEY, JSON.stringify({ ...queued, owner }));
    return true;
  } catch (error) {
    analytics.captureError("claim_been_cities_failed", error);
    return false;
  }
}

export function useSyncPendingBeenCities(): void {
  const { isAuthenticated } = useConvexAuth();
  const { onboarded } = useOnboarding();
  const { data: user } = useCurrentUser();
  const userId = user?._id ?? null;
  const update = useMutation(api.beenCities.updateBeenCities);
  const ranFor = useRef<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated || userId === null || !onboarded) return;
    if (ranFor.current === userId) return;
    const queued = readQueued();
    if (queued === null) return;
    ranFor.current = userId;
    if (queued.owner !== null && queued.owner !== userId) {
      clearQueuedBeenCities();
      return;
    }
    if (queued.owner === null && !claimQueued(queued, userId)) return;
    const { cities } = queued;
    void update({ add: cities }).then(
      () => {
        analytics.capture("been_cities_synced", { count: cities.length });
        clearQueuedBeenCities();
      },
      (error: unknown) =>
        analytics.captureError("been_cities_sync_failed", error),
    );
  }, [isAuthenticated, userId, onboarded, update]);
}
