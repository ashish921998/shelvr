/**
 * Paywall fallback screen. In production, the paywall is presented natively by
 * RevenueCat's `presentPaywall()` SDK (designed in the RevenueCat dashboard).
 * This screen only appears on real unavailability (SDK not linked, identity
 * sync timeout, network/config error) — user cancellation returns to the
 * previous screen without routing here.
 *
 * It deliberately avoids pricing copy because RevenueCat remains the source of
 * truth for current offerings. Restore Purchases is available via the native
 * paywall and Customer Center once the SDK is reachable again.
 */
import { openPaywall, waitForSheetTransition } from '@/lib/entitlement';
import { LEGAL_URLS } from '@/lib/legal';
import { useRouter } from 'expo-router';
import { Linking, Pressable, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native-unistyles';

export default function PaywallScreen() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <Text style={styles.title}>Shelvr Pro</Text>
      <Text style={styles.message}>
        We couldn’t load subscription options right now. Check your connection
        and try again. If you already purchased Pro, restore after the paywall
        loads, or manage your plan in Profile.
      </Text>
      <Pressable
        style={({ pressed }) => [styles.button, pressed && { opacity: 0.8 }]}
        onPress={() => {
          void (async () => {
            router.back();
            // This screen is a formSheet — UIKit refuses to present RC's
            // paywall while the dismissal is still animating, which would
            // map to 'unavailable' and bounce right back here.
            await waitForSheetTransition();
            await openPaywall(router);
          })();
        }}
      >
        <Text style={styles.buttonText}>Try again</Text>
      </Pressable>
      <Pressable
        style={({ pressed }) => [styles.secondary, pressed && { opacity: 0.7 }]}
        onPress={() => router.back()}
      >
        <Text style={styles.secondaryText}>Not now</Text>
      </Pressable>
      <Text style={styles.legal}>
        <Text
          style={styles.legalLink}
          onPress={() => void Linking.openURL(LEGAL_URLS.terms)}
        >
          Terms
        </Text>
        {' · '}
        <Text
          style={styles.legalLink}
          onPress={() => void Linking.openURL(LEGAL_URLS.privacy)}
        >
          Privacy
        </Text>
      </Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.gap(4),
    gap: theme.gap(2),
  },
  title: {
    fontFamily: theme.fonts.display,
    fontSize: 28,
    color: theme.colors.foreground,
  },
  message: {
    fontFamily: theme.fonts.regular,
    fontSize: 15,
    lineHeight: 22,
    color: theme.colors.muted,
    textAlign: 'center',
  },
  button: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    borderCurve: 'continuous',
    paddingVertical: theme.gap(1.75),
    paddingHorizontal: theme.gap(4),
    marginTop: theme.gap(1),
  },
  buttonText: {
    fontFamily: theme.fonts.bold,
    fontSize: 16,
    color: '#fff',
  },
  secondary: {
    paddingVertical: theme.gap(1),
    paddingHorizontal: theme.gap(2),
  },
  secondaryText: {
    fontFamily: theme.fonts.medium,
    fontSize: 15,
    color: theme.colors.muted,
  },
  legal: {
    marginTop: theme.gap(2),
    fontFamily: theme.fonts.regular,
    fontSize: 12,
    color: theme.colors.faint,
  },
  legalLink: {
    fontFamily: theme.fonts.medium,
    color: theme.colors.muted,
    textDecorationLine: 'underline',
  },
}));
