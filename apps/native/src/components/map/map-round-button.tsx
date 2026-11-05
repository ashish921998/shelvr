import { AppSymbolIcon, type AppSymbolName } from "@/components/symbol";
import { Pressable } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

export function MapRoundButton({
  icon,
  label,
  onPress,
}: {
  icon: AppSymbolName;
  label: string;
  onPress: () => void;
}) {
  const { theme } = useUnistyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <AppSymbolIcon
        name={icon}
        size={20}
        tintColor={theme.colors.foreground}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  button: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.16)",
  },
  pressed: { opacity: theme.opacity.pressed },
}));
