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

export function MapAvatarButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  const { theme } = useUnistyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.avatar, pressed && styles.pressed]}
    >
      <AppSymbolIcon
        name="person.fill"
        size={20}
        tintColor={theme.colors.foreground}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  button: {
    width: theme.control.minHeight,
    height: theme.control.minHeight,
    borderRadius: theme.radius.xl,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    boxShadow: "0 2px 6px rgba(43, 36, 24, 0.10)",
  },
  avatar: {
    width: theme.control.minHeight,
    height: theme.control.minHeight,
    borderRadius: theme.radius.xl,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    boxShadow: "0 2px 6px rgba(43, 36, 24, 0.10)",
  },
  pressed: { opacity: theme.opacity.pressed },
}));
