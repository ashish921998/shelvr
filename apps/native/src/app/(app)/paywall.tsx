/**
 * Paywall fallback screen. In production, the paywall is presented natively by
 * RevenueCat's `presentPaywall()` SDK (designed in the RevenueCat dashboard).
 * This screen only appears when the native RevenueCat UI module isn't linked
 * yet (e.g. running in Expo Go or a dev build without `expo prebuild`).
 *
 * Once `expo prebuild` is run and the app is rebuilt, users will never see this
 * screen — they'll get the full native paywall sheet rendered by the SDK.
 */
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

export default function PaywallScreen() {
  return (
    <View style={styles.container} />
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
}));
