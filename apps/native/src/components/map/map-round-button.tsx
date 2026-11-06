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
      hitSlop={5}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <AppSymbolIcon
        name={icon}
        size={16}
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
        size={17}
        tintColor={theme.colors.muted}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  button: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface,
    boxShadow: "0 2px 6px rgba(43, 36, 24, 0.2)",
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: 2.5,
    borderColor: theme.colors.primarySoft,
  },
  pressed: { opacity: theme.opacity.pressed },
}));
