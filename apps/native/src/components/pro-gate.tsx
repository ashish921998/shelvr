import { openPaywall } from '@/lib/entitlement';
import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Icon } from './symbol';

type Props = {
  title: string;
  message: string;
  /** Optional leading icon name (SF Symbol). Omit to hide the icon badge. */
  icon?: string;
  ctaLabel?: string;
  /** Override the CTA action. Defaults to presenting the paywall / fallback. */
  onPress?: () => void;
};

/**
 * The Pro upsell card shared by Tidy, Map, and the paywall fallback screen.
 * One layout + stylesheet replaces the three near-identical copies that lived
 * in each screen. The CTA defaults to `openPaywall` so each call site avoids
 * repeating the presentPaywall → router.push('/(app)/paywall') fallback.
 */
export function ProGate({
  title,
  message,
  icon,
  ctaLabel = 'Start 7-day free trial',
  onPress,
}: Props) {
  const router = useRouter();
  const { theme } = useUnistyles();
  const handlePress = onPress ?? (() => openPaywall(router));
  return (
    <View style={styles.container}>
      {icon !== undefined && (
        <View style={styles.iconBadge}>
          <Icon name={icon} size={28} tintColor={theme.colors.primaryText} />
        </View>
      )}
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      <Pressable
        style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85 }]}
        onPress={handlePress}
      >
        <Text style={styles.ctaText}>{ctaLabel}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.gap(4),
    gap: theme.gap(1.5),
    backgroundColor: theme.colors.background,
  },
  iconBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.gap(0.5),
  },
  title: {
    fontFamily: theme.fonts.bold,
    fontSize: 18,
    color: theme.colors.foreground,
  },
  message: {
    fontFamily: theme.fonts.regular,
    fontSize: 14,
    lineHeight: 20,
    color: theme.colors.muted,
    textAlign: 'center',
  },
  cta: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    borderCurve: 'continuous',
    paddingVertical: theme.gap(1.75),
    paddingHorizontal: theme.gap(4),
    alignItems: 'center',
    marginTop: theme.gap(1),
  },
  ctaText: {
    fontFamily: theme.fonts.bold,
    fontSize: 16,
    color: '#fff',
  },
}));
