import {
  presentCustomerCenter,
  waitForSheetTransition,
} from "@/lib/entitlement";
import { t } from "@/lib/i18n";
import { Alert, Linking, Platform } from "react-native";

/**
 * Opens subscription management for a current subscriber: RevenueCat's
 * Customer Center (cancel, refund, change plan, restore).
 *
 * RevenueCat UI presents from the root view controller, and UIKit refuses to
 * present while a form sheet is up ("already presenting RNSScreen"). So the
 * caller's `dismissSheets` closes every sheet first and this waits for them to
 * settle. When Customer Center is not linked or configured, or identity sync
 * timed out, it falls back to the platform's own subscription page rather
 * than leaving the tap with no visible effect.
 */
export async function manageSubscription(
  dismissSheets: () => void,
): Promise<void> {
  dismissSheets();
  await waitForSheetTransition();
  if (await presentCustomerCenter()) return;
  Alert.alert(t("pro.manage"), t("pro.manageHelp"), [
    { text: t("common.cancel"), style: "cancel" },
    {
      text: t("pro.openStore"),
      onPress: () =>
        void Linking.openURL(
          Platform.OS === "ios"
            ? "https://apps.apple.com/account/subscriptions"
            : "https://play.google.com/store/account/subscriptions",
        ),
    },
  ]);
}
