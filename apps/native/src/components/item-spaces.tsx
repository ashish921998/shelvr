import { Link } from "expo-router";
import type { Id } from "@convex/_generated/dataModel";
import { Pressable, Text, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { AppSymbolIcon } from "@/components/symbol";

export function ItemSpaces({
  itemId,
  spaces,
}: {
  itemId: Id<"items">;
  spaces: { _id: Id<"spaces">; name: string }[];
}) {
  const { theme } = useUnistyles();

  return (
    <View style={styles.row}>
      <Text style={styles.label} numberOfLines={2}>
        {spaces.length > 0
          ? `In ${spaces.map((space) => space.name).join(", ")}`
          : "In your inbox"}
      </Text>
      <Link href={{ pathname: "/manage-spaces", params: { itemId } }} asChild>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add to space"
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
        >
          <AppSymbolIcon
            name="rectangle.stack"
            size={13}
            tintColor={theme.colors.primaryText}
          />
          <Text style={styles.action}>Add to space</Text>
        </Pressable>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: { flexDirection: "row", alignItems: "center", gap: theme.gap(1) },
  label: {
    flex: 1,
    fontFamily: theme.fonts.medium,
    fontSize: 13,
    color: theme.colors.muted,
  },
  // A filled pill rather than bare text: the save's space assignment is a
  // first-class action, so the control should read as one (and hold a 44pt
  // touch target). primarySoft/primaryText keeps contrast in every appearance.
  button: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 14,
    backgroundColor: theme.colors.primarySoft,
    borderRadius: 50,
  },
  pressed: { opacity: 0.7 },
  action: {
    fontFamily: theme.fonts.bold,
    fontSize: 14,
    color: theme.colors.primaryText,
  },
}));
