import { api } from "@convex/_generated/api";
import { isRateLimitedError } from "@convex/model/demoErrors";
import { analytics } from "@/lib/analytics";
import { bestEffort } from "@/lib/best-effort";
import { useCurrentUser } from "@/lib/current-user";
import { recordShareSaved } from "@/lib/first-share";
import { useOnboarding } from "@/lib/onboarding";
import { findSample } from "@/lib/onboarding-demo";
import { queueDemoUrl, type PendingDemo } from "@/lib/pending-onboarding";
import { ConvexError } from "convex/values";
import { useConvexAuth, useMutation } from "convex/react";
import * as SecureStore from "expo-secure-store";
import { useEffect, useRef } from "react";

const KEY = "shelvr.onboarding.queuedSave";

type QueuedSave = PendingDemo & { owner: string | null };

function readQueued(): QueuedSave | null {
  try {
    const raw = SecureStore.getItem(KEY);
    if (raw === null || raw === "") return null;
    const value = JSON.parse(raw) as Partial<QueuedSave> | null;
    if (typeof value?.url !== "string" || value.url === "") return null;
    return {
      url: value.url,
      destination:
        typeof value.destination === "string" ? value.destination : null,
      source: value.source === "share" ? "share" : "direct",
      owner: typeof value.owner === "string" ? value.owner : null,
    };
  } catch {
    return null;
  }
}

// SecureStore's delete is async-only, so clearing writes "".
export function clearQueued() {
  bestEffort("clear_queued_first_save_failed", () =>
    SecureStore.setItem(KEY, ""),
  );
}

function claimQueued(save: QueuedSave, owner: string): boolean {
  try {
    SecureStore.setItem(KEY, JSON.stringify({ ...save, owner }));
    return true;
  } catch (error) {
    analytics.captureError("claim_queued_first_save_failed", error);
    return false;
  }
}

export function getQueuedFirstSaveUrl(): string | null {
  return readQueued()?.url ?? null;
}

/** Mount once, beside useReplayOnboarding: after sign-in, saves the queued first save as the free demo save. */
export function useQueuedFirstSave() {
  const { isAuthenticated } = useConvexAuth();
  const { onboarded } = useOnboarding();
  const { data: user } = useCurrentUser();
  const userId = user?._id ?? null;
  const createDemoItem = useMutation(api.demo.createDemoItem);
  const ranRef = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || userId === null || !onboarded || ranRef.current) {
      return;
    }
    const queued = readQueued();
    if (queued === null) return;
    ranRef.current = true;
    if (queued.owner !== null && queued.owner !== userId) {
      clearQueued();
      return;
    }
    if (queued.owner === null && !claimQueued(queued, userId)) return;
    const { url, destination, source } = queued;
    createDemoItem({
      url,
      title: findSample(url)?.pageHeading,
      spaceName: destination ?? undefined,
      analyticsSessionId: analytics.sessionId(),
    }).then(
      (result) => {
        if (result.reused && !result.urlMatchesRequest) {
          queueDemoUrl(url, destination, userId);
        } else {
          if (!result.reused) analytics.capture("onboarding_demo_submitted");
          if (source === "share" && result.urlMatchesRequest) {
            recordShareSaved(result.userId);
          }
        }
        clearQueued();
      },
      (error: unknown) => {
        analytics.captureError("onboarding_queued_save_failed", error);
        if (error instanceof ConvexError && !isRateLimitedError(error)) {
          queueDemoUrl(url, destination, userId);
          clearQueued();
        }
      },
    );
  }, [isAuthenticated, userId, onboarded, createDemoItem]);
}
