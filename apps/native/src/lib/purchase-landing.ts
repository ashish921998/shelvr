// A purchase or restore reaches Convex by RevenueCat webhook a moment after
// the store says yes. Every successful one bumps this counter, so screens can
// wait for the entitlement instead of asking for a plan again (see
// `useAwaitingOnboardingPurchase` in `replay-onboarding.ts`).
let landingNonce = 0;
const listeners = new Set<() => void>();

export function subscribePurchaseLanding(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const readPurchaseLanding = () => landingNonce;

/** A purchase or restore just succeeded in the store. */
export function notePurchaseLanding() {
  landingNonce += 1;
  listeners.forEach((listener) => listener());
}
