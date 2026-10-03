import { analytics } from "@/lib/analytics";
import type { RevenueCatPaywallResult } from "@/lib/paywall-result";
import type RevenueCatUI from "react-native-purchases-ui";
import type { CustomVariables } from "react-native-purchases-ui";
import type { PurchasesOffering } from "react-native-purchases";
import { useEffect, useSyncExternalStore } from "react";
import { AppState, Modal, Pressable, View } from "react-native";
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
};

// Never superseded: `presentExitSheet` refuses while one is open.
const sheet = createSheetRequestStore<Request, RevenueCatPaywallResult>(
  "CANCELLED",
);
let hosts = 0;
const finish = sheet.resolve;

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
  return sheet.request(input);
}

// The native view reports a dismissal that follows a purchase before or
// after the purchase itself, so a close waits briefly for a result to win.
const DISMISS_SETTLE_MS = 500;

export function ExitOfferSheetHost() {
  const current = useSyncExternalStore(sheet.subscribe, sheet.current);
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

  if (!current) return null;
  const { Paywall } = current;
  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={() => finish("CANCELLED")}
    >
      <View style={{ flex: 1 }}>
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
          onPurchaseStarted={({ packageBeingPurchased }) => {
            current.onPurchaseStarted?.(packageBeingPurchased.identifier);
          }}
          onPurchaseCompleted={() => finish("PURCHASED")}
          onRestoreCompleted={() => finish("RESTORED")}
          onDismiss={() =>
            setTimeout(() => {
              if (sheet.current() === current) finish("CANCELLED");
            }, DISMISS_SETTLE_MS)
          }
        />
        {/* The paywall design carries its own close, but RevenueCat's fallback
          screen (shown when a design fails to render) has none, so the app
          always keeps a way out. */}
        <Pressable
          onPress={() => finish("CANCELLED")}
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
