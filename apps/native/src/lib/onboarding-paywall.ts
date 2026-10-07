import { analytics } from "@/lib/analytics";
import {
  openPaywallKeepingExitOffer,
  useEntitlement,
  waitForSheetTransition,
} from "@/lib/entitlement";
import {
  noteDeclinedDuringOnboarding,
  notePurchasedDuringOnboarding,
} from "@/lib/replay-onboarding";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The paywall between the first save and the share practice. `ask` waits for
 * the entitlement to load, then sends a Pro account straight on and shows
 * everyone else the paywall once: a purchase goes on, anything else leaves
 * for the app. A relaunch lands back on the step before it and asks again.
 */
export function useOnboardingPaywall({
  onPro,
  onDecline,
}: {
  onPro: () => void;
  onDecline: () => void;
}): () => void {
  const router = useRouter();
  const { entitled, loading } = useEntitlement();
  const [asked, setAsked] = useState(false);
  const started = useRef(false);
  const handlers = useRef({ onPro, onDecline });
  useEffect(() => {
    handlers.current = { onPro, onDecline };
  });

  useEffect(() => {
    if (!asked || loading || started.current) return;
    started.current = true;
    if (entitled) {
      handlers.current.onPro();
      return;
    }
    const decline = () => {
      noteDeclinedDuringOnboarding();
      handlers.current.onDecline();
    };
    // The reminder step may have just closed the OS permission prompt.
    waitForSheetTransition()
      // Nobody tapped for this sheet, so a declined exit offer just closes.
      .then(() => openPaywallKeepingExitOffer(router, "onboarding", false))
      .then((purchased) => {
        if (!purchased) return decline();
        notePurchasedDuringOnboarding();
        handlers.current.onPro();
      })
      .catch((error: unknown) => {
        analytics.captureError("onboarding_paywall_failed", error);
        decline();
      });
  }, [asked, loading, entitled, router]);

  return useCallback(() => setAsked(true), []);
}
