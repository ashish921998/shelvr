import { AppSymbolIcon } from "@/components/symbol";
import { t } from "@/lib/i18n";
import { Pressable } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

export function MapLocateButton({ onPress }: { onPress: () => void }) {
  const { theme } = useUnistyles();
  return (
    <Pressable
      testID="map-locate-button"
      accessibilityRole="button"
      accessibilityLabel={t("map.showMyLocation")}
      onPress={onPress}
      pressRetentionOffset={theme.control.pressRetentionOffset}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <AppSymbolIcon
        name="location"
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
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surface,
    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.16)",
  },
  pressed: { opacity: theme.opacity.pressed },
}));
