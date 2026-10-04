import { recordAccess } from "@/lib/paywall-funnel";
import type { RevenueCatPaywallResult } from "@/lib/paywall-result";
import { router } from "expo-router";

/**
 * Connects `openPaywall` to the paywall route. RevenueCat's
 * `presentPaywall()` resolved one promise with the sheet's outcome; the app's
 * own paywall is a screen, so each presentation is a request that waits here
 * until that screen has closed. The outcome strings stay RevenueCat's, so
 * `observePaywallPresentation`, the exit offer after a close, and the
 * blocked-action funnel read it exactly as before.
 *
 * A request settles once. A screen that never mounted reports NOT_PRESENTED,
 * so a close is only counted as `paywall_shown` when the paywall was seen.
 * The screen settles on its closing transition's end, not on the tap, so
 * whatever presents next (the exit offer, an alert) never races the
 * dismissal.
 *
 * The route also opens with no request: from the widget's `shelvr:///paywall`
 * link, or as the fallback after a failed presentation. The screen then
 * adopts a session of its own (`adoptPaywallRoute` in `entitlement.ts`)
 * without navigating again, and claims the request it creates.
 */

export type PaywallRequest = {
  id: number;
  placement: string;
  attemptId: string;
  /** Set once the screen has mounted for this request. */
  claimed: boolean;
  /** Cleared when that screen closes, even if a purchase still holds it. */
  onScreen: boolean;
  /** Created for a route that was already open, so nothing navigated. */
  adopted: boolean;
  resolve: (result: RevenueCatPaywallResult) => void;
};

// A screen that never mounts (navigation refused mid-transition) must not
// hold the request until the sheet latch goes stale.
const MOUNT_TIMEOUT_MS = 4000;

let request: PaywallRequest | null = null;
let nextId = 1;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((read) => read());

/** Fires when a request is created or settled. */
export function subscribePaywallRequest(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

/**
 * Opens the paywall route and resolves with how it closed. The caller holds
 * the sheet latch in `entitlement.ts`, so a second request never overlaps;
 * if one did, it reports NOT_PRESENTED rather than stealing the screen.
 * `navigate` is a no-op when the route is already open.
 */
export function presentPaywallScreen(input: {
  placement: string;
  attemptId: string;
  navigate?: () => void;
}): Promise<RevenueCatPaywallResult> {
  if (request) return Promise.resolve("NOT_PRESENTED");
  return new Promise((resolve) => {
    const mine: PaywallRequest = {
      id: nextId++,
      placement: input.placement,
      attemptId: input.attemptId,
      claimed: false,
      onScreen: false,
      adopted: input.navigate !== undefined,
      resolve,
    };
    request = mine;
    notify();
    setTimeout(() => {
      if (request === mine && !mine.claimed)
        finishPaywall("NOT_PRESENTED", mine);
    }, MOUNT_TIMEOUT_MS);
    try {
      (input.navigate ?? (() => router.push("/(app)/paywall")))();
    } catch {
      finishPaywall("NOT_PRESENTED", mine);
    }
  });
}

/**
 * The mounted screen takes the waiting request, if there is one. A screen
 * already open without one only takes a request made for it by adoption,
 * never one that is about to push its own copy of the route.
 */
export function claimPaywallRequest(
  only: "any" | "adopted" = "any",
): PaywallRequest | null {
  if (!request || request.claimed) return null;
  if (only === "adopted" && !request.adopted) return null;
  request.claimed = true;
  request.onScreen = true;
  return request;
}

/**
 * True while a mounted paywall screen holds a request. A screen that closed
 * with a purchase still in flight no longer counts, so a purchase that never
 * settles can't keep the sheet latch past its stale age.
 */
export function isPaywallScreenOpen(): boolean {
  return request?.onScreen === true;
}

/** The screen that claimed `owner` has closed. */
export function leavePaywallScreen(owner: PaywallRequest | null): void {
  if (owner) owner.onScreen = false;
}

/**
 * Reports how the paywall closed. `owner` is the request the screen claimed,
 * or null when it had none; a purchase or restore with nobody waiting
 * records its own access, which `presentPaywallImpl` does otherwise. Only
 * the first report for a request counts, and an unclaimed request can only
 * settle as NOT_PRESENTED.
 */
export function finishPaywall(
  result: RevenueCatPaywallResult,
  owner: PaywallRequest | null,
): void {
  if (!owner) {
    if (result === "PURCHASED" || result === "RESTORED") {
      recordAccess(result === "RESTORED" ? "restore" : "purchase");
    }
    return;
  }
  if (request !== owner) return;
  request = null;
  notify();
  owner.resolve(owner.claimed ? result : "NOT_PRESENTED");
}

// RevenueCat's PURCHASES_ERROR_CODE values, kept as strings so this stays
// testable without the native module.
const PURCHASE_CANCELLED = "1";
const PAYMENT_PENDING = "20";

export type PurchaseOutcome = "purchased" | "cancelled" | "pending" | "failed";

/** Sorts a rejected `purchasePackage` call into what the screen shows. */
export function classifyPurchaseError(error: unknown): PurchaseOutcome {
  if (!error || typeof error !== "object") return "failed";
  const { code, userCancelled } = error as {
    code?: unknown;
    userCancelled?: unknown;
  };
  if (userCancelled === true || String(code) === PURCHASE_CANCELLED)
    return "cancelled";
  if (String(code) === PAYMENT_PENDING) return "pending";
  return "failed";
}
