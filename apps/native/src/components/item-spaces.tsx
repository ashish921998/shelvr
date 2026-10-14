import { AppSymbolIcon } from "@/components/symbol";
import { t, useAppLocale } from "@/lib/i18n";
import type { Id } from "@convex/_generated/dataModel";
import { useRouter } from "expo-router";
import { Pressable, Text } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

// Where a save is filed. Tapping it opens the same space picker as the ⋯
// menu's "Add to space". A save in no space shows nothing here; the menu
// still offers it.
export function ItemSpaces({
  itemId,
  spaces,
  centered = false,
}: {
  itemId: Id<"items">;
  spaces: { _id: Id<"spaces">; name: string }[];
  centered?: boolean;
}) {
  useAppLocale();
  const router = useRouter();
  const { theme } = useUnistyles();

  if (spaces.length === 0) return null;

  const label = t("item.inSpaces", {
    spaces: spaces.map((space) => space.name).join(", "),
  });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={t("spaces.membershipHelp")}
      hitSlop={8}
      onPress={() =>
        router.push({ pathname: "/manage-spaces", params: { itemId } })
      }
      style={[styles.row, centered && styles.centered]}
    >
      <Text style={styles.label} numberOfLines={2}>
        {label}
      </Text>
      <AppSymbolIcon
        name="chevron.right"
        size={10}
        weight="semibold"
        tintColor={theme.colors.muted}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
  },
  centered: {
    alignSelf: "center",
  },
  label: {
    flexShrink: 1,
    fontFamily: theme.fonts.medium,
    fontSize: 13,
    color: theme.colors.muted,
  },
}));
