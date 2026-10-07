import { analytics } from "@/lib/analytics";
import { openPaywallKeepingExitOffer, useEntitlement } from "@/lib/entitlement";
import {
  noteDeclinedDuringOnboarding,
  notePurchasedDuringOnboarding,
} from "@/lib/replay-onboarding";
import { useConvexAuth } from "convex/react";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The paywall at the end of onboarding, after the share practice. `ask` waits
 * for the entitlement to load, then lets a Pro or signed-out account through
 * and shows everyone else the paywall once. A relaunch lands back on the share step and
 * asks again.
 */
export function useOnboardingPaywall({
  onPro,
  onDecline,
}: {
  onPro: () => void;
  onDecline: () => void;
}): () => void {
  const router = useRouter();
  const { isAuthenticated } = useConvexAuth();
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
    // Skipping the first save skips sign-in too, and a purchase needs an
    // account. The app asks for both once onboarding is done.
    if (entitled || !isAuthenticated) {
      handlers.current.onPro();
      return;
    }
    const decline = () => {
      noteDeclinedDuringOnboarding();
      handlers.current.onDecline();
    };
    // Skipping the practice reaches this without asking for a paywall, so a
    // declined exit offer just closes.
    openPaywallKeepingExitOffer(router, "onboarding", false)
      .then((purchased) => {
        if (!purchased) return decline();
        notePurchasedDuringOnboarding();
        handlers.current.onPro();
      })
      .catch((error: unknown) => {
        analytics.captureError("onboarding_paywall_failed", error);
        decline();
      });
  }, [asked, loading, entitled, isAuthenticated, router]);

  return useCallback(() => setAsked(true), []);
}
