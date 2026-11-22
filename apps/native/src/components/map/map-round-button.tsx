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
      hitSlop={4}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <AppSymbolIcon
        name={icon}
        size={17}
        tintColor={theme.colors.foreground}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  button: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface,
    boxShadow: "0 2px 6px rgba(43, 36, 24, 0.2)",
  },
  pressed: { opacity: theme.opacity.pressed },
}));
