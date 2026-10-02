import { HeaderIconButton } from "@/components/ui/header-icon-button";
import { t } from "@/lib/i18n";
import { Pressable, Text, View, useWindowDimensions } from "react-native";
import Animated from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";

/** The design is drawn for an 874pt-tall screen; at 812 and under it tightens. */
export function useCompactPaywall(): boolean {
  return useWindowDimensions().height <= 812;
}

/** Back (step 2 only), two progress bars, and Close. */
export function PaywallHeader({
  step,
  onBack,
  onClose,
}: {
  step: 0 | 1;
  onBack: () => void;
  onClose: () => void;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.slot}>
        {step === 1 ? (
          <HeaderIconButton
            icon="chevron.left"
            label={t("common.back")}
            onPress={onBack}
          />
        ) : null}
      </View>
      <View style={styles.progress} accessibilityElementsHidden>
        <Animated.View style={styles.bar(true)} />
        <Animated.View style={styles.bar(step === 1)} />
      </View>
      <View style={styles.slot}>
        <HeaderIconButton
          icon="xmark"
          label={t("common.close")}
          onPress={onClose}
        />
      </View>
    </View>
  );
}

export function StepHeading({
  eyebrow,
  title,
}: {
  eyebrow: string;
  title: string;
}) {
  return (
    <View>
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
    </View>
  );
}

export function PrimaryButton({
  label,
  busy,
  disabled,
  onPress,
}: {
  label: string;
  busy?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const inactive = !!busy || !!disabled;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: !!busy }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        pressed && styles.buttonPressed,
        inactive && styles.buttonInactive,
      ]}
    >
      <Text style={styles.buttonLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  header: {
    height: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  slot: { width: 40, height: 40 },
  progress: { flexDirection: "row", gap: 6 },
  bar: (filled: boolean) => ({
    width: 28,
    height: 4,
    borderRadius: 2,
    backgroundColor: filled ? theme.colors.primary : theme.colors.border,
    transitionProperty: "backgroundColor",
    transitionDuration: 300,
  }),
  eyebrow: {
    marginTop: 14,
    fontFamily: theme.fonts.bold,
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: theme.colors.faint,
    textAlign: "center",
  },
  title: {
    marginTop: 8,
    fontFamily: theme.fonts.display,
    fontSize: 31,
    lineHeight: 36,
    letterSpacing: -0.3,
    color: theme.colors.foreground,
    textAlign: "center",
  },
  button: {
    minHeight: 54,
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.gap(2),
  },
  buttonPressed: { opacity: 0.85 },
  buttonInactive: { opacity: theme.opacity.pressed },
  buttonLabel: {
    fontFamily: theme.fonts.bold,
    fontSize: 17,
    color: theme.colors.primaryForeground,
    textAlign: "center",
  },
}));
