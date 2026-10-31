import { ThemedText } from "@/components/ui/themed-text";
import { t } from "@/lib/i18n";
import { fadeIn, fadeOut } from "@/lib/motion";
import { useEffect } from "react";
import { AccessibilityInfo, Pressable } from "react-native";
import Animated from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";

export function UndoBar({
  message,
  onUndo,
  disabled = false,
  raised = false,
}: {
  message: string | null;
  onUndo: () => void;
  disabled?: boolean;
  raised?: boolean;
}) {
  useEffect(() => {
    if (message && process.env.EXPO_OS === "ios")
      AccessibilityInfo.announceForAccessibility(message);
  }, [message]);
  if (message === null) return null;
  return (
    <Animated.View
      entering={fadeIn}
      exiting={fadeOut}
      style={[styles.bar, raised && styles.raised]}
      accessibilityLiveRegion="polite"
    >
      <ThemedText variant="footnote" numberOfLines={2} style={styles.message}>
        {message}
      </ThemedText>
      <Pressable
        accessibilityRole="button"
        hitSlop={8}
        disabled={disabled}
        onPress={onUndo}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      >
        <ThemedText variant="labelStrong" style={styles.action}>
          {t("common.undo")}
        </ThemedText>
      </Pressable>
    </Animated.View>
  );
}
const styles = StyleSheet.create((theme, rt) => ({
  bar: {
    position: "absolute",
    left: theme.gap(2),
    right: theme.gap(2),
    bottom: rt.insets.bottom + theme.gap(2),
    minHeight: theme.control.minHeight,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1.5),
    paddingLeft: theme.gap(2),
    paddingRight: theme.gap(1),
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    backgroundColor: theme.colors.foreground,
  },
  raised: { bottom: rt.insets.bottom + theme.gap(12) },
  message: { flex: 1, color: theme.colors.background },
  button: {
    paddingHorizontal: theme.gap(1.5),
    paddingVertical: theme.gap(1),
    minHeight: 44,
    justifyContent: "center",
  },
  action: { color: theme.colors.primary },
  pressed: { opacity: theme.opacity.pressed },
}));
