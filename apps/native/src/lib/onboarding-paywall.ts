import { analytics } from "@/lib/analytics";
import { notePurchaseBeforeSignIn } from "@/lib/purchase-before-sign-in";
import { openPaywallOutcome, useEntitlement } from "@/lib/entitlement";
import {
  noteDeclinedDuringOnboarding,
  notePurchasedDuringOnboarding,
} from "@/lib/replay-onboarding";
import { useConvexAuth } from "convex/react";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";

const ENTITLEMENT_WAIT_MS = 5000;

/**
 * The paywall at the end of onboarding, after the promise step. `ask` waits
 * for the entitlement to load, then lets a Pro account through and shows
 * everyone else the paywall once. Signed out, the purchase is anonymous and
 * the sign-in that follows onboarding attaches it to the new account. A relaunch lands back on the promise step and
 * asks again. A paywall that could not show (RevenueCat not ready, offline)
 * was never declined: `onUnavailable` finishes without saying so, and the
 * app asks again once Home is up.
 */
export function useOnboardingPaywall({
  onPro,
  onDecline,
  onUnavailable,
}: {
  onPro: () => void;
  onDecline: () => void;
  onUnavailable: () => void;
}): { ask: () => void; asked: boolean } {
  const router = useRouter();
  const { isAuthenticated } = useConvexAuth();
  const { entitled, loading } = useEntitlement();
  const [asked, setAsked] = useState(false);
  // Offline the entitlement never loads. Past this wait the account is
  // treated as not Pro, so the step cannot hang on a spinner.
  const [waitedOut, setWaitedOut] = useState(false);
  useEffect(() => {
    if (!asked || !loading) return;
    const id = setTimeout(() => setWaitedOut(true), ENTITLEMENT_WAIT_MS);
    return () => clearTimeout(id);
  }, [asked, loading]);
  const started = useRef(false);
  const handlers = useRef({ onPro, onDecline, onUnavailable });
  useEffect(() => {
    handlers.current = { onPro, onDecline, onUnavailable };
  });

  useEffect(() => {
    if (!asked || (loading && !waitedOut) || started.current) return;
    started.current = true;
    if (entitled) {
      handlers.current.onPro();
      return;
    }
    const decline = () => {
      noteDeclinedDuringOnboarding();
      handlers.current.onDecline();
    };
    openPaywallOutcome(router, "onboarding")
      .then((outcome) => {
        if (outcome === "unavailable") return handlers.current.onUnavailable();
        if (outcome === "cancelled") return decline();
        notePurchasedDuringOnboarding();
        if (!isAuthenticated) notePurchaseBeforeSignIn();
        handlers.current.onPro();
      })
      .catch((error: unknown) => {
        analytics.captureError("onboarding_paywall_failed", error);
        handlers.current.onUnavailable();
      });
  }, [asked, loading, waitedOut, entitled, isAuthenticated, router]);

  const ask = useCallback(() => setAsked(true), []);
  return { ask, asked };
}
