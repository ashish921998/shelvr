import { analytics } from "@/lib/analytics";
import type { RevenueCatPaywallResult } from "@/lib/paywall-result";
import type RevenueCatUI from "react-native-purchases-ui";
import type { CustomVariables } from "react-native-purchases-ui";
import type { PurchasesOffering } from "react-native-purchases";
import { useEffect, useSyncExternalStore } from "react";
import { AppState, Modal } from "react-native";

/**
 * The exit offer's own full-screen sheet. RevenueCat's `presentPaywall` sheet
 * can't be closed or blocked by the app, so one opened just before the
 * deadline would stay buyable after it. This hosts RevenueCat's paywall view
 * instead: at the deadline the sheet closes, including on return from the
 * background, and a purchase tapped after it is refused before the store
 * sheet opens. The countdown on Home stays true for everyone.
 */

type Request = {
  Paywall: (typeof RevenueCatUI)["Paywall"];
  offering: PurchasesOffering;
  customVariables?: CustomVariables;
  endsAt: number;
  resolve: (result: RevenueCatPaywallResult) => void;
};

let request: Request | null = null;
let hosts = 0;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((read) => read());
function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

function finish(result: RevenueCatPaywallResult): void {
  const current = request;
  if (!current) return;
  request = null;
  notify();
  current.resolve(result);
}

/**
 * Shows the exit offering until the user buys, restores, closes it, or the
 * deadline passes. Resolves with the same result strings `presentPaywall`
 * returns; NOT_PRESENTED when no host is mounted or the offer already ended.
 */
export function presentExitSheet(
  input: Omit<Request, "resolve">,
): Promise<RevenueCatPaywallResult> {
  if (hosts === 0 || request || Date.now() >= input.endsAt)
    return Promise.resolve("NOT_PRESENTED");
  return new Promise((resolve) => {
    request = { ...input, resolve };
    notify();
  });
}

// The native view reports a dismissal that follows a purchase before or
// after the purchase itself, so a close waits briefly for a result to win.
const DISMISS_SETTLE_MS = 500;

export function ExitOfferSheetHost() {
  const current = useSyncExternalStore(subscribe, () => request);

  useEffect(() => {
    hosts += 1;
    return () => {
      hosts -= 1;
      finish("CANCELLED");
    };
  }, []);

  useEffect(() => {
    if (!current) return;
    const expire = () => {
      if (Date.now() < current.endsAt) return;
      analytics.capture("exit_offer_expired_open", {});
      finish("CANCELLED");
    };
    // Timers pause in the background, so a check on return covers them.
    const tick = setInterval(expire, 1000);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") expire();
    });
    return () => {
      clearInterval(tick);
      sub.remove();
    };
  }, [current]);

  if (!current) return null;
  const { Paywall } = current;
  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={() => finish("CANCELLED")}
    >
      <Paywall
        style={{ flex: 1 }}
        options={{
          offering: current.offering,
          customVariables: current.customVariables,
        }}
        onPurchasePackageInitiated={({ resume }) => {
          const open = Date.now() < current.endsAt;
          resume(open);
          if (!open) {
            analytics.capture("exit_offer_expired_open", {});
            finish("CANCELLED");
          }
        }}
        onPurchaseCompleted={() => finish("PURCHASED")}
        onRestoreCompleted={() => finish("RESTORED")}
        onDismiss={() =>
          setTimeout(() => {
            if (request === current) finish("CANCELLED");
          }, DISMISS_SETTLE_MS)
        }
      />
    </Modal>
  );
}
