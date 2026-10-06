import { analytics } from "@/lib/analytics";
import {
  restoreFoundAccess,
  type RevenueCatPaywallResult,
} from "@/lib/paywall-result";
import type RevenueCatUI from "react-native-purchases-ui";
import type { CustomVariables } from "react-native-purchases-ui";
import type { PurchasesOffering } from "react-native-purchases";
import { useEffect, useState, useSyncExternalStore } from "react";
import {
  Alert,
  AppState,
  Modal,
  Platform,
  Pressable,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";
import { AppSymbolIcon } from "@/components/symbol";
import { t, useAppLocale } from "@/lib/i18n";
import { createSheetRequestStore } from "@/lib/sheet-request-store";

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
  /** Fires with the package's identifier the moment the user taps purchase —
   * the one purchase-start signal RevenueCat's component API exposes. */
  onPurchaseStarted?: (packageId: string) => void;
  /** Fires when the person closes the sheet themselves, not when the deadline
   * or a torn-down host closes it. */
  onDeclined?: () => void;
};

// Never superseded: `presentExitSheet` refuses while one is open.
const sheet = createSheetRequestStore<Request, RevenueCatPaywallResult>(
  "CANCELLED",
);
let hosts = 0;

// A sheet that never reports its dismissal (Android, a torn-down host) must
// not hold the next presentation back.
const DISMISSAL_CAP_MS = 1500;
let dismissal: Promise<void> = Promise.resolve();
let settleDismissal: () => void = () => {};

function finish(result: RevenueCatPaywallResult, declined = false): void {
  const current = sheet.current();
  if (!current) return;
  dismissal = new Promise((resolve) => {
    settleDismissal = resolve;
    setTimeout(resolve, DISMISSAL_CAP_MS);
  });
  // Clears the request and notifies the host; the caller's await resumes
  // only after this function returns, so `onDeclined` still runs first.
  sheet.resolve(result);
  if (declined) current.onDeclined?.();
}

/**
 * Resolves once the last sheet has left the screen. UIKit refuses a new
 * presentation while one is still dismissing.
 */
export function whenExitSheetDismissed(): Promise<void> {
  return dismissal;
}

/**
 * Shows the exit offering until the user buys, restores, closes it, or the
 * deadline passes. Resolves with the same result strings `presentPaywall`
 * returns; NOT_PRESENTED when no host is mounted or the offer already ended.
 */
export function presentExitSheet(
  input: Request,
): Promise<RevenueCatPaywallResult> {
  if (hosts === 0 || sheet.current() || Date.now() >= input.endsAt)
    return Promise.resolve("NOT_PRESENTED");
  // A fresh object per request, so the host never mistakes a reused input for
  // the sheet still sliding away.
  return sheet.request({ ...input });
}

// The native view reports a dismissal that follows a purchase before or
// after the purchase itself, so a close waits briefly for a result to win.
const DISMISS_SETTLE_MS = 500;

export function ExitOfferSheetHost() {
  const current = useSyncExternalStore(sheet.subscribe, sheet.current);
  // The sheet stays rendered while it slides away, so iOS reports when the
  // dismissal has finished.
  const [shown, setShown] = useState(current);
  if (current && current !== shown) setShown(current);
  const insets = useSafeAreaInsets();
  useAppLocale();

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

  if (!shown) return null;
  const { Paywall } = shown;
  return (
    <Modal
      visible={current !== null}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={() => finish("CANCELLED", true)}
      onDismiss={() => {
        setShown(null);
        settleDismissal();
      }}
    >
      <View style={{ flex: 1 }}>
        <Paywall
          style={{ flex: 1 }}
          options={{
            offering: shown.offering,
            customVariables: shown.customVariables,
          }}
          onPurchasePackageInitiated={({ resume }) => {
            const open = Date.now() < shown.endsAt;
            // A sheet that is already sliding away sells nothing.
            resume(open && sheet.current() === shown);
            if (!open) {
              analytics.capture("exit_offer_expired_open", {});
              finish("CANCELLED");
            }
          }}
          onPurchaseStarted={({ packageBeingPurchased }) => {
            shown.onPurchaseStarted?.(packageBeingPurchased.identifier);
          }}
          onPurchaseCompleted={() => finish("PURCHASED")}
          onRestoreCompleted={({ customerInfo }) => {
            // A restore that lands after this sheet closed must not settle
            // or speak for whatever is open now.
            if (sheet.current() !== shown) return;
            if (restoreFoundAccess(customerInfo)) {
              finish("RESTORED");
              return;
            }
            // Nothing to restore: the offer stays open and says so.
            Alert.alert(
              t("pro.notFoundTitle"),
              t("pro.notFoundBody", {
                store: Platform.OS === "ios" ? "App Store" : "Google Play",
              }),
            );
          }}
          onDismiss={() =>
            setTimeout(() => {
              if (sheet.current() === shown) finish("CANCELLED", true);
            }, DISMISS_SETTLE_MS)
          }
        />
        {/* The paywall design carries its own close, but RevenueCat's fallback
          screen (shown when a design fails to render) has none, so the app
          always keeps a way out. */}
        <Pressable
          onPress={() => finish("CANCELLED", true)}
          accessibilityRole="button"
          accessibilityLabel={t("common.close")}
          hitSlop={12}
          style={[styles.close, { top: insets.top + 8 }]}
        >
          <AppSymbolIcon
            name="xmark"
            size={14}
            weight="semibold"
            tintColor="#fff"
          />
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  close: {
    position: "absolute",
    left: 16,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0, 0, 0, 0.35)",
  },
});
