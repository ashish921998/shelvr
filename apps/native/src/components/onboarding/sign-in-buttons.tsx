import { t, useAppLocale } from "@/lib/i18n";
import { isAnonymousAuthEnabled } from "@/lib/anonymous-auth";
import type { OAuthProvider, useOAuthSignIn } from "@/lib/oauth-sign-in";
import { GhostButton } from "@/components/onboarding/parts";
import { ActivityIndicator, Platform, Pressable, Text } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

/** Apple (iOS), Google and the dev login, with the failure line and the
 * privacy note. The caller owns the OAuth state, so a sheet can stay open
 * while a sign-in is in flight. */
export function SignInButtons({
  oauth,
}: {
  oauth: ReturnType<typeof useOAuthSignIn>;
}) {
  useAppLocale();
  const { theme } = useUnistyles();
  const { signInWith, pendingProvider, lastError, interrupted } = oauth;
  const busy = pendingProvider !== null;
  const signIn = (provider: OAuthProvider) => {
    void signInWith(provider);
  };

  return (
    <>
      {!busy && (lastError !== null || interrupted) ? (
        <Text style={styles.error}>{t("demo.signInFailed")}</Text>
      ) : null}

      {Platform.OS === "ios" ? (
        <Pressable
          onPress={() => signIn("apple")}
          disabled={busy}
          style={({ pressed }) => [
            styles.authBtn,
            styles.authBtnApple,
            busy && { opacity: 0.4 },
            pressed && { opacity: 0.85 },
          ]}
        >
          {pendingProvider === "apple" ? (
            <ActivityIndicator color={theme.colors.background} />
          ) : (
            <Text style={[styles.authBtnText, styles.authBtnTextApple]}>
              {t("account.apple")}
            </Text>
          )}
        </Pressable>
      ) : null}
      <Pressable
        onPress={() => signIn("google")}
        disabled={busy}
        style={({ pressed }) => [
          styles.authBtn,
          busy && { opacity: 0.4 },
          pressed && { opacity: 0.85 },
        ]}
      >
        {pendingProvider === "google" ? (
          <ActivityIndicator color={theme.colors.foreground} />
        ) : (
          <Text style={styles.authBtnText}>{t("account.google")}</Text>
        )}
      </Pressable>
      {isAnonymousAuthEnabled() ? (
        <GhostButton
          label={t("account.anonymous")}
          onPress={() => signIn("anonymous")}
          disabled={busy}
          testID="onboarding-dev-login"
        />
      ) : null}
      <Text style={styles.privacy}>{t("demo.privacyNote")}</Text>
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  error: {
    fontFamily: theme.fonts.regular,
    fontSize: 13,
    color: theme.colors.danger,
  },
  authBtn: {
    minHeight: 52,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  authBtnApple: {
    backgroundColor: theme.colors.foreground,
    borderColor: theme.colors.foreground,
  },
  authBtnText: {
    fontFamily: theme.fonts.bold,
    fontSize: 16,
    color: theme.colors.foreground,
  },
  authBtnTextApple: {
    color: theme.colors.background,
  },
  privacy: {
    fontFamily: theme.fonts.regular,
    fontSize: 12,
    textAlign: "center",
    color: theme.colors.faint,
  },
}));
