import { analytics } from "@/lib/analytics";
import { openPaywallOutcome, useEntitlement } from "@/lib/entitlement";
import {
  noteDeclinedDuringOnboarding,
  notePurchasedDuringOnboarding,
} from "@/lib/replay-onboarding";
import { useConvexAuth } from "convex/react";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";

const ENTITLEMENT_WAIT_MS = 5000;

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
    if (entitled || !isAuthenticated) {
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
