import { AppSymbolIcon } from "@/components/symbol";
import { Pressable } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

const SIZE = 21;

export function BackCircle({
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
      hitSlop={(44 - SIZE) / 2}
      style={({ pressed }) => [styles.circle, pressed && styles.pressed]}
    >
      <AppSymbolIcon
        name="chevron.left"
        size={10}
        weight="bold"
        tintColor={theme.colors.surface}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  circle: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.foreground,
  },
  pressed: { opacity: theme.opacity.pressed },
}));
