import { ActivityIndicator, Pressable, Text } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

/** The primary CTA used by every step's footer. */
export function CtaButton({
  label,
  onPress,
  disabled,
  busy,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
}) {
  const { theme } = useUnistyles();
  const inactive = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!busy }}
      onPress={inactive ? undefined : onPress}
      style={({ pressed }) => [
        styles.cta,
        disabled && styles.ctaDisabled,
        pressed && !inactive && { opacity: 0.85 },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={theme.colors.primaryForeground} />
      ) : (
        <Text style={styles.ctaText}>{label}</Text>
      )}
    </Pressable>
  );
}

/** The quiet secondary action under a CTA. */
export function GhostButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.ghost,
        disabled && { opacity: 0.4 },
        pressed && { opacity: 0.7 },
      ]}
    >
      <Text style={styles.ghostText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  cta: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    paddingVertical: theme.gap(2),
    minHeight: 54,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "stretch",
  },
  ctaDisabled: {
    opacity: 0.4,
  },
  ctaText: {
    fontFamily: theme.fonts.bold,
    fontSize: 17,
    color: theme.colors.primaryForeground,
  },
  ghost: {
    minHeight: 44,
    paddingHorizontal: theme.gap(1),
    alignSelf: "center",
    justifyContent: "center",
  },
  ghostText: {
    fontFamily: theme.fonts.medium,
    fontSize: 15,
    color: theme.colors.muted,
  },
}));
