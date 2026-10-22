import { restorePurchases } from "@/lib/entitlement";
import { t } from "@/lib/i18n";
import { useState } from "react";
import { Alert, Platform } from "react-native";

export function useRestorePurchases() {
  const [restoring, setRestoring] = useState(false);
  const restore = async () => {
    if (restoring) return;
    const storeName = Platform.OS === "ios" ? "App Store" : "Google Play";
    setRestoring(true);
    try {
      const outcome = await restorePurchases();
      if (outcome === "restored") {
        Alert.alert(
          t("pro.restoredTitle"),
          t("pro.restoredBody", { store: storeName }),
        );
      } else if (outcome === "none") {
        Alert.alert(
          t("pro.notFoundTitle"),
          t("pro.notFoundBody", { store: storeName }),
        );
      } else {
        Alert.alert(
          t("pro.restoreFailed"),
          t("pro.restoreFailedBody", { store: storeName }),
        );
      }
    } finally {
      setRestoring(false);
    }
  };
  return { restoring, restore };
}
