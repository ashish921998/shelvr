import { GlassView } from "@/components/glass";
import { AppSymbolIcon } from "@/components/symbol";
import { Pressable, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

const BADGE_SIZE = 26;

export function SuggestedBadge({
  size = BADGE_SIZE,
  onPress,
}: {
  size?: number;
  onPress?: () => void;
}) {
  const { theme } = useUnistyles();
  const circle = (
    <GlassView
      style={[
        styles.circle,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
      glassEffectStyle="regular"
      isInteractive={onPress !== undefined}
    >
      <AppSymbolIcon
        name="sparkles"
        size={size * 0.55}
        tintColor={theme.colors.primary}
      />
    </GlassView>
  );
  if (onPress === undefined) {
    return <View pointerEvents="none">{circle}</View>;
  }
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      style={({ pressed }) => pressed && styles.pressed}
    >
      {circle}
    </Pressable>
  );
}

const styles = StyleSheet.create(() => ({
  circle: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  pressed: {
    opacity: 0.7,
  },
}));
