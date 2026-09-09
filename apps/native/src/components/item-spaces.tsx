import { Link } from "expo-router";
import type { Id } from "@convex/_generated/dataModel";
import { Pressable, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

export function ItemSpaces({
  itemId,
  spaces,
}: {
  itemId: Id<"items">;
  spaces: { _id: Id<"spaces">; name: string }[];
}) {
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
          accessibilityLabel="Change spaces"
          style={styles.button}
        >
          <Text style={styles.action}>Change</Text>
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
  button: {
    minHeight: 44,
    minWidth: 60,
    alignItems: "center",
    justifyContent: "center",
  },
  action: {
    fontFamily: theme.fonts.bold,
    fontSize: 13,
    color: theme.colors.primaryText,
  },
}));
