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

export function useReviewPrompt(
  items: FeedbackFeedItem[] | undefined,
  { defer = false }: { defer?: boolean } = {},
) {
  const segments: readonly string[] = useSegments();
  const home = isHomeRootRoute(segments);
  const onSave = segments[1] === "item";
  const cameFromSave = useRef(false);
  const [returned, setReturned] = useState(false);
  const spent = useRef(false);
  useEffect(() => {
    if (home) {
      spent.current = false;
      setReturned(cameFromSave.current);
    } else cameFromSave.current = onSave;
  }, [onSave, home]);
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

  useEffect(() => {
    if (
      !returned ||
      spent.current ||
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
        if (
          (await StoreReview.hasAction()) &&
          !cancelled &&
          homeRef.current &&
          !Keyboard.isVisible() &&
          !isPaywallPending() &&
          AppState.currentState === "active"
        ) {
          SecureStore.setItem(PROMPTED_KEY, "true");
          markNativeReviewPrompted();
          analytics.capture("review_prompted", { ready_count: count });
          await StoreReview.requestReview();
        }
      } catch {
        // Best-effort: Apple rate-limits internally and returns no signal.
      } finally {
        if (!cancelled) {
          spent.current = true;
          setNativeReviewAttemptInFlight(false);
        }
      }
    }
  }, [items, returned, home, defer, keyboardVisible, appState]);
}
