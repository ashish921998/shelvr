import { analytics } from "@/lib/analytics";
import {
  countEligibleSaves,
  isHomeRootRoute,
  markNativeReviewPrompted,
  setNativeReviewAttemptInFlight,
  type FeedbackFeedItem,
} from "@/lib/feedback";
import { isPaywallPending } from "@/lib/entitlement";
import { useKeyboardVisible } from "@/lib/use-keyboard-visible";
import { useSegments } from "expo-router";
import { AppState, Keyboard } from "react-native";
import * as StoreReview from "expo-store-review";
import { useEffect, useRef, useState } from "react";
import * as SecureStore from "expo-secure-store";

const PROMPTED_KEY = "shelvr.review.prompted";
const READY_ITEM_THRESHOLD = 3;
/**
 * How long Home must stay settled before the rating sheet may appear. Closing
 * Add (or any sheet) flips the route back to Home before its dismissal and the
 * keyboard's slide-out finish. iOS presenting the review sheet in that gap can
 * leave the keyboard's window stranded over the app, swallowing every tap
 * until a restart.
 */
export const REVIEW_PROMPT_SETTLE_MS = 1500;

/** A feed item the prompt can follow from processing to ready. */
type ReviewFeedItem = FeedbackFeedItem & { _id: string };

/**
 * Asks for a rating right after a win: a save the user watched arrive in this
 * session has just been read, titled and filed. Opening the app onto an
 * already-full Home is not a win, so it never asks then. `defer` holds the
 * prompt back, e.g. through an account's first session: asking for a rating
 * before real use is what people resent.
 */
export function useReviewPrompt(
  items: ReviewFeedItem[] | undefined,
  { defer = false }: { defer?: boolean } = {},
) {
  // Saves seen processing this session, and whether one has since turned
  // ready. Tracked on every feed change, Home or not, so a save that finishes
  // while item detail is open still counts once the user is back on Home.
  const seenProcessing = useRef(new Set<string>());
  const [filed, setFiled] = useState(false);
  useEffect(() => {
    if (!items || filed) return;
    for (const item of items) {
      if (item.status === "processing") seenProcessing.current.add(item._id);
      else if (item.status === "ready" && seenProcessing.current.has(item._id))
        setFiled(true);
    }
  }, [items, filed]);
  const home = isHomeRootRoute(useSegments());
  const homeRef = useRef(home);
  useEffect(() => {
    homeRef.current = home;
  }, [home]);
  const keyboardVisible = useKeyboardVisible();
  const [appState, setAppState] = useState(AppState.currentState);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", setAppState);
    return () => subscription.remove();
  }, []);

  // Every change to these deps cancels the pending attempt in cleanup and, if
  // the guards still pass, schedules a fresh one with a full settle window.
  // That includes any new `items` array, so a burst of saves finishing keeps
  // pushing the prompt back until the feed is quiet: Home must hold still.
  useEffect(() => {
    if (
      !filed ||
      !home ||
      defer ||
      keyboardVisible ||
      !items ||
      isPaywallPending() ||
      appState !== "active"
    )
      return;
    if (items.some((item) => item.status === "processing")) return;

    const readyCount = countEligibleSaves(items);
    if (readyCount < READY_ITEM_THRESHOLD) return;
    if (SecureStore.getItem(PROMPTED_KEY) === "true") return;

    // Hold the moment from the feedback invitation while Home settles, so the
    // two prompts never appear together.
    setNativeReviewAttemptInFlight(true);
    let cancelled = false;
    const timer = setTimeout(
      () => void attempt(readyCount),
      REVIEW_PROMPT_SETTLE_MS,
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
      setNativeReviewAttemptInFlight(false);
    };

    async function attempt(count: number) {
      try {
        // hasAction() can resolve before React commits a render that changed
        // a guard above, so every guard needs a live re-read here or must
        // cancel this attempt through a dep. Add new guards to both places.
        if (
          (await StoreReview.hasAction()) &&
          !cancelled &&
          homeRef.current &&
          !Keyboard.isVisible() &&
          !isPaywallPending() &&
          AppState.currentState === "active"
        ) {
          // Persisted synchronously after the last check, so a superseding
          // run always sees it and can never prompt a second time.
          SecureStore.setItem(PROMPTED_KEY, "true");
          // The in-app feedback invitation shares this threshold; tell it the
          // native review flow claimed this moment so the two never fire together.
          markNativeReviewPrompted();
          analytics.capture("review_prompted", { ready_count: count });
          await StoreReview.requestReview();
        }
      } catch {
        // Best-effort — Apple rate-limits internally and returns no signal.
      } finally {
        // A cancelled attempt's cleanup already released the hold, and a
        // newer attempt may own it now. A suppressed one (no review action,
        // keyboard up, paywall) recorded nothing, so a later change retries.
        if (!cancelled) setNativeReviewAttemptInFlight(false);
      }
    }
  }, [items, filed, home, defer, keyboardVisible, appState]);
}
