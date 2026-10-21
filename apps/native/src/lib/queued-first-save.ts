import { api } from "@convex/_generated/api";
import { isRateLimitedError } from "@convex/model/demoErrors";
import { useAiConsent } from "@/lib/ai-consent";
import { analytics } from "@/lib/analytics";
import { useCurrentUser } from "@/lib/current-user";
import { recordShareSaved } from "@/lib/first-share";
import { useOnboarding } from "@/lib/onboarding";
import { findSample } from "@/lib/onboarding-demo";
import { queueDemoUrl, type PendingDemo } from "@/lib/pending-onboarding";
import { ConvexError } from "convex/values";
import { useConvexAuth, useMutation } from "convex/react";
import * as SecureStore from "expo-secure-store";
import { useEffect, useRef } from "react";

// The first save a person picked in onboarding before they had an account.
// The account comes after the paywall, so the save waits here, across an app
// kill, until sign-in. Kept apart from the onboarding replay record, which is
// cleared as a whole when the replay finishes. Cleared with setItem('')
// because SecureStore's delete is async-only.
const KEY = "shelvr.onboarding.queuedSave";

/** The first account to sign in after the pick claims the save, so a save
 * left behind by a failure never lands in an account that signs in later on
 * the same device. Null until claimed. */
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

function clearQueued() {
  try {
    SecureStore.setItem(KEY, "");
  } catch {
    // A save left queued is retried once more on the next launch; the server
    // returns the same demo item.
  }
}

/** Keeps the picked save, with its space, until the account exists. */
export function queueFirstSave(save: PendingDemo) {
  const queued: QueuedSave = { ...save, owner: null };
  SecureStore.setItem(KEY, JSON.stringify(queued));
}

/** Claims the save for `owner` before it is sent. Returns false when the
 * claim could not be stored: sending it unclaimed would let a failure leave
 * it for the next account. */
function claimQueued(save: QueuedSave, owner: string): boolean {
  try {
    SecureStore.setItem(KEY, JSON.stringify({ ...save, owner }));
    return true;
  } catch {
    return false;
  }
}

export function getQueuedFirstSaveUrl(): string | null {
  return readQueued()?.url ?? null;
}

/**
 * After sign-in, saves the first save picked before it as the account's
 * onboarding demo: free once per account, filed where it was picked for, and
 * under a sample's own heading, so it lands whether or not the person bought.
 * Waits for the AI answer, as the demo step does. An account whose demo save
 * is already spent (it signed in before, on another install) hands the link
 * and its space to the replay, which saves it there once the account is Pro.
 * A save another account claimed is dropped unsaved.
 *
 * Mounted in (app)/_layout.tsx beside useReplayOnboarding.
 */
export function useQueuedFirstSave() {
  const { isAuthenticated } = useConvexAuth();
  const { onboarded } = useOnboarding();
  const { savesBlocked } = useAiConsent();
  const { data: user } = useCurrentUser();
  const userId = user?._id ?? null;
  const createDemoItem = useMutation(api.demo.createDemoItem);
  const ranRef = useRef(false);

  useEffect(() => {
    if (
      !isAuthenticated ||
      userId === null ||
      !onboarded ||
      savesBlocked ||
      ranRef.current
    ) {
      return;
    }
    const queued = readQueued();
    if (queued === null) return;
    // One attempt per mount: a failure that is not the server's answer (no
    // network, a rate limit) waits for the next launch instead of retrying in
    // a loop.
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
        // The server turned the save down for good (the demo's item is
        // gone, or the link is invalid): the replay tries it as a normal
        // save once the account is Pro. A rate limit is not an answer; the
        // free save is tried again on the next launch.
        if (error instanceof ConvexError && !isRateLimitedError(error)) {
          queueDemoUrl(url, destination, userId);
          clearQueued();
        }
      },
    );
  }, [isAuthenticated, userId, onboarded, savesBlocked, createDemoItem]);
}
