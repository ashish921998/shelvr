import type { IntentKind } from "@/lib/intents";
import { AppSymbolIcon, type AppSymbolName } from "@/components/symbol";
import { Pressable, Text } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

// The app owns the kind → icon mapping so the model can never emit an invalid
// SF Symbol. `sparkles` is a forward-compat fallback for a kind a newer backend
// might add before this build knows about it.
const ICONS: Record<IntentKind, AppSymbolName> = {
  open_url: "arrow.up.right.square",
  copy: "doc.on.doc",
  web_search: "magnifyingglass",
  open_maps: "map",
  call: "phone",
  email: "envelope",
  message: "message",
  add_event: "calendar",
};

export function IntentChip({
  kind,
  label,
  onPress,
}: {
  kind: IntentKind;
  label: string;
  onPress: () => void;
}) {
  const { theme } = useUnistyles();
  const icon = ICONS[kind] ?? "sparkles";
  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
      onPress={onPress}
      // The pill stays compact; the slop brings the touch target to 48.
      hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
    >
      <AppSymbolIcon
        name={icon}
        size={14}
        tintColor={theme.colors.primaryText}
      />
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: theme.colors.primarySoft,
    paddingVertical: theme.gap(1),
    paddingHorizontal: theme.gap(1.5),
    borderRadius: 50,
  },
  chipPressed: {
    opacity: 0.7,
  },
  label: {
    fontFamily: theme.fonts.medium,
    fontSize: 13,
    color: theme.colors.primaryText,
  },
}));
