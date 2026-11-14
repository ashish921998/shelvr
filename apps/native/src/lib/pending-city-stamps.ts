import { api } from "@convex/_generated/api";
import { analytics } from "@/lib/analytics";
import { bestEffort } from "@/lib/best-effort";
import { useCurrentUser } from "@/lib/current-user";
import { useOnboarding } from "@/lib/onboarding";
import { readSampleCities, type SampleCityId } from "@/lib/sample-cities";
import { useConvexAuth, useMutation } from "convex/react";
import * as SecureStore from "expo-secure-store";
import { useEffect, useRef } from "react";

const KEY = "shelvr.onboarding.cityStamps";

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
  } catch (error) {
    analytics.captureError("read_city_stamps_failed", error);
    return null;
  }
}

export function queueCityStamps(cities: readonly SampleCityId[]): void {
  bestEffort("queue_city_stamps_failed", () =>
    SecureStore.setItem(
      KEY,
      cities.length === 0 ? "" : JSON.stringify({ cities, owner: null }),
    ),
  );
}

export function clearQueuedCityStamps(): void {
  bestEffort("clear_city_stamps_failed", () => SecureStore.setItem(KEY, ""));
}

function claimQueued(queued: QueuedCities, owner: string): boolean {
  try {
    SecureStore.setItem(KEY, JSON.stringify({ ...queued, owner }));
    return true;
  } catch (error) {
    analytics.captureError("claim_city_stamps_failed", error);
    return false;
  }
}

export function useSyncPendingCityStamps(): void {
  const { isAuthenticated } = useConvexAuth();
  const { onboarded } = useOnboarding();
  const { data: user } = useCurrentUser();
  const userId = user?._id ?? null;
  const claim = useMutation(api.cityStamps.claimOnboardingCityStamps);
  const ranFor = useRef<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated || userId === null || !onboarded) return;
    if (ranFor.current === userId) return;
    const queued = readQueued();
    if (queued === null) return;
    ranFor.current = userId;
    if (queued.owner !== null && queued.owner !== userId) {
      clearQueuedCityStamps();
      return;
    }
    if (queued.owner === null && !claimQueued(queued, userId)) return;
    const { cities } = queued;
    void claim({ cities }).then(
      (stamped) => {
        analytics.capture("passport_city_stamps_claimed", {
          picked: cities.length,
          stamped,
        });
        if (readQueued()?.owner === userId) clearQueuedCityStamps();
      },
      (error: unknown) =>
        analytics.captureError("city_stamps_claim_failed", error),
    );
  }, [isAuthenticated, userId, onboarded, claim]);
}
