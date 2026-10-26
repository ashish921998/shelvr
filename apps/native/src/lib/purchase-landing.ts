const PURCHASE_LANDING_MS = 10_000;

let landingUntil = 0;
let session = 0;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

export function subscribePurchaseLanding(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const readPurchaseLanding = () => landingUntil;

export function notePurchaseLanding() {
  landingUntil = Date.now() + PURCHASE_LANDING_MS;
  notify();
}

export function settlePurchaseLanding() {
  if (landingUntil === 0) return;
  landingUntil = 0;
  notify();
}

export function reservePurchaseLanding() {
  const at = session;
  return () => {
    if (at === session) notePurchaseLanding();
  };
}

export function endPurchaseLandingSession() {
  session += 1;
  settlePurchaseLanding();
}
