// A purchase or restore reaches Convex by RevenueCat webhook a moment after
// the store says yes. Every successful one opens a short window in which
// screens wait for the entitlement instead of asking for a plan again (see
// `useAwaitingOnboardingPurchase` in `replay-onboarding.ts`). The window is
// an absolute deadline, so a remount or a sign-out cannot stretch it.
const PURCHASE_LANDING_MS = 10_000;

let landingUntil = 0;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

export function subscribePurchaseLanding(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** When the current purchase's wait ends, in epoch ms; 0 when none is open. */
export const readPurchaseLanding = () => landingUntil;

/** A purchase or restore just succeeded in the store. */
export function notePurchaseLanding() {
  landingUntil = Date.now() + PURCHASE_LANDING_MS;
  notify();
}

/** The entitlement arrived, so the purchase is no longer news. */
export function settlePurchaseLanding() {
  if (landingUntil === 0) return;
  landingUntil = 0;
  notify();
}
