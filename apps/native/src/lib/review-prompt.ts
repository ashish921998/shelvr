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
import { useEffect, useRef } from "react";
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

/** `defer` holds the prompt back, e.g. through an account's first session:
 * asking for a rating before real use is what people resent. */
export function useReviewPrompt(
  items: FeedbackFeedItem[] | undefined,
  { defer = false }: { defer?: boolean } = {},
) {
  const triggered = useRef(false);
  const home = isHomeRootRoute(useSegments());
  const homeRef = useRef(home);
  useEffect(() => {
    homeRef.current = home;
  }, [home]);
  const keyboardVisible = useKeyboardVisible();

  useEffect(() => {
    if (
      !home ||
      defer ||
      keyboardVisible ||
      !items ||
      triggered.current ||
      isPaywallPending() ||
      AppState.currentState !== "active"
    )
      return;
    if (items.some((item) => item.status === "processing")) return;

    const readyCount = countEligibleSaves(items);
    if (readyCount < READY_ITEM_THRESHOLD) return;

    const alreadyPrompted = SecureStore.getItem(PROMPTED_KEY) === "true";
    if (alreadyPrompted) {
      triggered.current = true;
      return;
    }

    // Hold the moment from the feedback invitation while Home settles, so the
    // two prompts never appear together. Released below if the wait is cut.
    setNativeReviewAttemptInFlight(true);
    let started = false;
    const timer = setTimeout(() => {
      // Claim the attempt so overlapping feed updates cannot start a second
      // one while hasAction() is pending. Nothing is persisted until the
      // prompt is actually about to fire.
      started = true;
      triggered.current = true;
      void attempt(readyCount);
    }, REVIEW_PROMPT_SETTLE_MS);
    return () => {
      clearTimeout(timer);
      if (!started) setNativeReviewAttemptInFlight(false);
    };

    async function attempt(count: number) {
      let prompted = false;
      try {
        if (
          (await StoreReview.hasAction()) &&
          homeRef.current &&
          !Keyboard.isVisible() &&
          !isPaywallPending() &&
          AppState.currentState === "active"
        ) {
          prompted = true;
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
        setNativeReviewAttemptInFlight(false);
        // A suppressed attempt (left Home, keyboard up, paywall opened,
        // backgrounded, or no review action) recorded nothing, so a later
        // feed change may retry.
        if (!prompted) triggered.current = false;
      }
    }
  }, [items, home, defer, keyboardVisible]);
}
