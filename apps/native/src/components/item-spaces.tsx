import { t, useAppLocale } from "@/lib/i18n";
import type { Id } from "@convex/_generated/dataModel";
import { Text } from "react-native";
import { StyleSheet } from "react-native-unistyles";

export function ItemSpaces({
  spaces,
}: {
  spaces: { _id: Id<"spaces">; name: string }[];
}) {
  useAppLocale();

  return (
    <Text style={styles.label} numberOfLines={2}>
      {spaces.length > 0
        ? t("item.inSpaces", {
            spaces: spaces.map((space) => space.name).join(", "),
          })
        : t("item.inbox")}
    </Text>
  );
}

const styles = StyleSheet.create((theme) => ({
  label: {
    fontFamily: theme.fonts.medium,
    fontSize: 13,
    color: theme.colors.muted,
  },
}));
