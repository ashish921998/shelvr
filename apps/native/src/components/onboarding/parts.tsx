import { AppSymbolIcon, type AppSymbolName } from '@/components/symbol';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { StyleSheet } from 'react-native-unistyles';

// Moved out of onboarding.tsx so the promise (step 1) and permissions (step 7)
// screens can reuse the exact rows the v1 single-screen flow shipped with — same
// copy, same styling — without the orchestrator owning presentational pieces.

/** A numbered value-prop row: icon in a soft pill, title + supporting line. */
export function FeatureRow({
  icon,
  title,
  message,
  delay,
}: {
  icon: AppSymbolName;
  title: string;
  message: string;
  delay: number;
}) {
  return (
    <Animated.View entering={FadeInDown.delay(delay).duration(400)} style={styles.feature}>
      <View style={styles.featureIcon}>
        <AppSymbolIcon name={icon} size={20} tintColor={styles.featureIcon.tintColor} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.featureTitle}>{title}</Text>
        <Text style={styles.featureMessage}>{message}</Text>
      </View>
    </Animated.View>
  );
}

/** A single permission toggle row. Once granted it shows a check and goes inert. */
export function PermissionButton({
  icon,
  label,
  granted,
  onPress,
}: {
  icon: AppSymbolName;
  label: string;
  granted: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={granted ? undefined : onPress}
      style={({ pressed }) => [
        styles.permission,
        granted && styles.permissionGranted,
        pressed && !granted && { opacity: 0.8 },
      ]}
    >
      <AppSymbolIcon
        name={granted ? 'checkmark.circle.fill' : icon}
        size={18}
        tintColor={granted ? styles.permissionGrantedText.color : styles.permissionText.color}
      />
      <Text style={styles.permissionLabel}>{label}</Text>
      <Text style={granted ? styles.permissionStateGranted : styles.permissionState}>
        {granted ? 'Ready' : 'Allow'}
      </Text>
    </Pressable>
  );
}

/**
 * The shared primary CTA used by every step's footer. `disabled` dims it and
 * blocks the press — used by steps that gate advance on a selection (min 1
 * space, etc.). Always orange + white text to match v1.
 */
export function CtaButton({
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
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [styles.cta, disabled && styles.ctaDisabled, pressed && !disabled && { opacity: 0.85 }]}
    >
      <Text style={styles.ctaText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  feature: {
    flexDirection: 'row',
    gap: theme.gap(1.5),
    alignItems: 'flex-start',
  },
  featureIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    tintColor: theme.colors.primaryText,
  },
  featureTitle: {
    fontFamily: theme.fonts.bold,
    fontSize: 16,
    color: theme.colors.foreground,
  },
  featureMessage: {
    fontFamily: theme.fonts.regular,
    fontSize: 14,
    lineHeight: 20,
    color: theme.colors.muted,
  },
  permission: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.gap(1.25),
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.gap(1.5),
  },
  permissionGranted: {
    borderColor: theme.colors.primarySoft,
    backgroundColor: theme.colors.primarySoft,
  },
  permissionLabel: {
    flex: 1,
    fontFamily: theme.fonts.medium,
    fontSize: 15,
    color: theme.colors.foreground,
  },
  permissionText: {
    color: theme.colors.foreground,
  },
  permissionGrantedText: {
    color: theme.colors.primary,
  },
  permissionState: {
    fontFamily: theme.fonts.bold,
    fontSize: 13,
    color: theme.colors.primaryText,
  },
  permissionStateGranted: {
    fontFamily: theme.fonts.bold,
    fontSize: 13,
    color: theme.colors.primary,
  },
  cta: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    borderCurve: 'continuous',
    paddingVertical: theme.gap(2),
    alignItems: 'center',
  },
  ctaDisabled: {
    opacity: 0.4,
  },
  ctaText: {
    fontFamily: theme.fonts.bold,
    fontSize: 17,
    color: '#fff',
  },
}));
