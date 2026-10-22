import {
  presentCustomerCenter,
  waitForSheetTransition,
} from "@/lib/entitlement";
import { t } from "@/lib/i18n";
import { Alert, Linking, Platform } from "react-native";

// UIKit refuses to present while a form sheet is up ("already presenting RNSScreen").
export async function manageSubscription(
  dismissSheets: () => void | Promise<void>,
): Promise<void> {
  await dismissSheets();
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
