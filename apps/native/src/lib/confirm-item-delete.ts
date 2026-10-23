import { Alert } from "react-native";
import { t } from "@/lib/i18n";

/** Deleting a save can't be undone, so every Delete asks first. */
export function confirmItemDelete(onConfirm: () => unknown): void {
  Alert.alert(t("item.deleteTitle"), t("item.deleteBody"), [
    { text: t("common.cancel"), style: "cancel" },
    {
      text: t("common.delete"),
      style: "destructive",
      onPress: () => void onConfirm(),
    },
  ]);
}
