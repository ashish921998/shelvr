import { useAuthActions } from '@convex-dev/auth/react';
import * as WebBrowser from 'expo-web-browser';
import * as React from 'react';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

/**
 * Convex Auth OAuth sign-in (React Native).
 *
 * The flow is provider-agnostic: `signIn(provider)` returns a `redirect` URL
 * hosted on the Convex backend. We open it in a system browser session
 * (expo-web-browser `openAuthSessionAsync`); after the user authenticates the
 * browser redirects back to the app with a `?code=` param. We extract that code
 * and call `signIn(provider, { code })` to complete the handshake.
 *
 * Google and Apple are configured on the backend (convex/auth.ts). The
 * "Continue" / "Dev login" button is only shown when Anonymous is enabled on the
 * deployment (AUTH_ENABLE_ANONYMOUS=true).
 */
export default function Page() {
  const { signIn } = useAuthActions();
  const [pending, setPending] = React.useState<string | null>(null);
  const [lastError, setLastError] = React.useState<string | null>(null);

  const handleOAuth = async (provider: string) => {
    setPending(provider);
    try {
      const { redirect } = await signIn(provider);
      // `redirect` is undefined for providers that sign in immediately
      // (Anonymous) — nothing more to do, the session is established.
      if (!redirect) return;
      const result = await WebBrowser.openAuthSessionAsync(
        redirect.toString(),
        'shelvr://',
      );
      if (result.type !== 'success') return;
      // Hand the callback URL's code back to the provider to finish the sign-in.
      const code = new URL(result.url).searchParams.get('code');
      if (!code) return;
      await signIn(provider, { code });
    } catch (err) {
      // Surface the full error shape — Convex wraps server errors with
      // `.message` and sometimes `.data`; logging the whole object helps
      // diagnose auth failures (expired tickets, provider misconfig, etc.).
      const detail =
        err instanceof Error
          ? `${err.name}: ${err.message}${(err as any).data ? ` | data=${JSON.stringify((err as any).data)}` : ''}`
          : JSON.stringify(err);
      console.error(`${provider} sign-in failed`, detail, err);
      setLastError(detail);
    } finally {
      setPending(null);
    }
  };

  const anonEnabled = __DEV__ && process.env.EXPO_PUBLIC_AUTH_ENABLE_ANONYMOUS === 'true';

  return (
    <View style={styles.container}>
      <View style={styles.center}>
        <View style={styles.header}>
          <Text style={styles.title}>shelvr</Text>
          <Text style={styles.subtitle}>Sign in to continue</Text>
        </View>

        <View style={styles.buttons}>
          <Pressable
            style={({ pressed }) => [
              styles.appleButton,
              pending !== null && styles.buttonDisabled,
              pressed && styles.buttonPressed,
            ]}
            onPress={() => handleOAuth('apple')}
            disabled={pending !== null}
          >
            <Text style={styles.appleButtonText}>Continue with Apple</Text>
          </Pressable>
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
        By continuing you agree to our Terms and acknowledge our Privacy Policy.
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
    backgroundColor: theme.colors.foreground,
    paddingVertical: theme.gap(2),
    borderRadius: 14,
    alignItems: 'center',
  },
  appleButtonText: {
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
