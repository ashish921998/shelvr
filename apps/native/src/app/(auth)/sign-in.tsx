import { LEGAL_URLS } from '@/lib/legal';
import { useOAuthSignIn } from '@/lib/oauth-sign-in';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as React from 'react';
import {
  Linking,
  Platform,
  Pressable,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

/**
 * Convex Auth OAuth sign-in (React Native). The flow lives in
 * `lib/oauth-sign-in.ts` (shared with the onboarding demo's inline sign-in);
 * this screen is its full-page presentation. Google and Apple are configured
 * on the backend (convex/auth.ts). The "Dev login" button is only shown when
 * Anonymous is enabled on the deployment (AUTH_ENABLE_ANONYMOUS=true).
 */
export default function Page() {
  const { signInWith: handleOAuth, pendingProvider: pending, lastError } = useOAuthSignIn();
  const colorScheme = useColorScheme();

  const anonEnabled =
    __DEV__ && process.env.EXPO_PUBLIC_AUTH_ENABLE_ANONYMOUS === 'true';

  return (
    <View style={styles.container}>
      <View style={styles.center}>
        <View style={styles.header}>
          <Text style={styles.title}>shelvr</Text>
          <Text style={styles.subtitle}>Sign in to continue</Text>
        </View>

        <View style={styles.buttons}>
          {Platform.OS === 'ios' ? (
            <AppleAuthentication.AppleAuthenticationButton
              testID="apple-sign-in-button"
              buttonType={
                AppleAuthentication.AppleAuthenticationButtonType.CONTINUE
              }
              buttonStyle={
                colorScheme === 'dark'
                  ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                  : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
              }
              cornerRadius={14}
              style={[
                styles.appleButton,
                pending !== null && styles.buttonDisabled,
              ]}
              pointerEvents={pending !== null ? 'none' : 'auto'}
              onPress={() => handleOAuth('apple')}
            />
          ) : (
            <Pressable
              style={({ pressed }) => [
                styles.appleFallbackButton,
                pending !== null && styles.buttonDisabled,
                pressed && styles.buttonPressed,
              ]}
              onPress={() => handleOAuth('apple')}
              disabled={pending !== null}
            >
              <Text style={styles.appleFallbackButtonText}>
                Continue with Apple
              </Text>
            </Pressable>
          )}
          <Pressable
            style={({ pressed }) => [
              styles.googleButton,
              pending !== null && styles.buttonDisabled,
              pressed && styles.buttonPressed,
            ]}
            onPress={() => handleOAuth('google')}
            disabled={pending !== null}
          >
            <Text style={styles.googleButtonText}>Continue with Google</Text>
          </Pressable>
          {anonEnabled && (
            <Pressable
              testID="dev-login-button"
              style={({ pressed }) => [
                styles.devButton,
                pending !== null && styles.buttonDisabled,
                pressed && styles.buttonPressed,
              ]}
              onPress={() => handleOAuth('anonymous')}
              disabled={pending !== null}
            >
              <Text style={styles.devButtonText}>Continue without account</Text>
            </Pressable>
          )}
        </View>
      </View>

      <Text style={styles.terms}>
        By continuing you agree to our{' '}
        <Text
          style={styles.termsLink}
          onPress={() => void Linking.openURL(LEGAL_URLS.terms)}
        >
          Terms
        </Text>{' '}
        and acknowledge our{' '}
        <Text
          style={styles.termsLink}
          onPress={() => void Linking.openURL(LEGAL_URLS.privacy)}
        >
          Privacy Policy
        </Text>
        .
      </Text>

      {lastError !== null && (
        <Text selectable style={styles.error}>
          {lastError}
        </Text>
      )}
    </View>
  );
}
const styles = StyleSheet.create((theme, rt) => ({
  container: {
    flex: 1,
    padding: theme.gap(2.5),
    paddingTop: rt.insets.top + theme.gap(3),
    paddingBottom: rt.insets.bottom + theme.gap(2),
    alignItems: 'center',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'stretch',
    gap: theme.gap(8),
  },
  header: {
    alignItems: 'center',
    gap: theme.gap(1),
  },
  title: {
    fontFamily: theme.fonts.display,
    fontSize: 48,
    color: theme.colors.primary,
  },
  subtitle: {
    fontFamily: theme.fonts.regular,
    fontSize: 16,
    color: theme.colors.muted,
  },
  buttons: {
    alignSelf: 'stretch',
    gap: theme.gap(2),
  },
  appleButton: {
    alignSelf: 'stretch',
    height: 52,
  },
  appleFallbackButton: {
    backgroundColor: theme.colors.foreground,
    paddingVertical: theme.gap(2),
    borderRadius: 14,
    alignItems: 'center',
  },
  appleFallbackButtonText: {
    color: theme.colors.background,
    fontFamily: theme.fonts.medium,
    fontSize: 16,
  },
  googleButton: {
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: theme.gap(2),
    borderRadius: 14,
    alignItems: 'center',
  },
  googleButtonText: {
    color: theme.colors.foreground,
    fontFamily: theme.fonts.medium,
    fontSize: 16,
  },
  devButton: {
    backgroundColor: 'transparent',
    paddingVertical: theme.gap(1.25),
    alignItems: 'center',
    marginTop: theme.gap(0.5),
  },
  devButtonText: {
    color: theme.colors.muted,
    fontFamily: theme.fonts.regular,
    fontSize: 14,
  },
  terms: {
    fontFamily: theme.fonts.regular,
    fontSize: 12,
    lineHeight: 17,
    color: theme.colors.faint,
    textAlign: 'center',
    paddingHorizontal: theme.gap(4),
    marginBottom: theme.gap(2),
  },
  termsLink: {
    fontFamily: theme.fonts.medium,
    color: theme.colors.muted,
    textDecorationLine: 'underline',
  },
  error: {
    marginTop: 16,
    paddingHorizontal: 16,
    color: theme.colors.danger,
    fontSize: 12,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonPressed: {
    opacity: 0.7,
  },
}));
