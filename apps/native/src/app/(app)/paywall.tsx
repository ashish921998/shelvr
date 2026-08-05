/**
 * Paywall fallback screen. In production, the paywall is presented natively by
 * RevenueCat's `presentPaywall()` SDK (designed in the RevenueCat dashboard).
 * This screen only appears when the native RevenueCat UI module isn't linked
 * yet (e.g. running in Expo Go or a dev build without `expo prebuild`), or
 * when the user dismisses the native paywall without purchasing.
 *
 * Once `expo prebuild` is run and the app is rebuilt, users will never see this
 * screen — they'll get the full native paywall sheet rendered by the SDK.
 */
import { Pressable, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { useRouter } from 'expo-router';

export default function PaywallScreen() {
  const router = useRouter();
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Shelvr Pro</Text>
      <Text style={styles.message}>
        Start your 7-day free trial to save links, photos, and notes. After the
        trial, it&apos;s just $4.99/month or $39.99/year.
      </Text>
      <Pressable
        style={({ pressed }) => [styles.button, pressed && { opacity: 0.8 }]}
        onPress={() => router.back()}
      >
        <Text style={styles.buttonText}>Maybe later</Text>
      </Pressable>
    </View>
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
}));
