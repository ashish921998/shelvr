import { t, useAppLocale } from "@/lib/i18n";
import { LEGAL_URLS } from "@/lib/legal";
import { useOAuthSignIn, type OAuthProvider } from "@/lib/oauth-sign-in";
import { AppSymbolIcon } from "@/components/symbol";
import * as AppleAuthentication from "expo-apple-authentication";
import {
  Linking,
  Platform,
  Pressable,
  Text,
  useColorScheme,
  View,
} from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

/**
 * Full-page Convex Auth sign-in, shown by the (auth) route and by the
 * onboarding opener. The "Dev login" button is only shown when Anonymous is
 * enabled on the deployment (AUTH_ENABLE_ANONYMOUS=true).
 */
export function SignInView({
  onCompleted,
  onBack,
}: {
  onCompleted?: () => void;
  onBack?: () => void;
}) {
  useAppLocale();
  const { signInWith, pendingProvider: pending, lastError } = useOAuthSignIn();
  const colorScheme = useColorScheme();
  const { theme } = useUnistyles();

  const handleOAuth = async (provider: OAuthProvider) => {
    if ((await signInWith(provider)) === "completed") onCompleted?.();
  };

  const anonEnabled =
    __DEV__ && process.env.EXPO_PUBLIC_AUTH_ENABLE_ANONYMOUS === "true";

  return (
    <View style={styles.container}>
      {onBack ? (
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel={t("common.back")}
          hitSlop={12}
          style={styles.back}
        >
          <AppSymbolIcon
            name="chevron.left"
            size={20}
            tintColor={theme.colors.foreground}
          />
        </Pressable>
      ) : null}
      <View style={styles.center}>
        <View style={styles.header}>
          <Text style={styles.title}>shelvr</Text>
          <Text style={styles.subtitle}>{t("account.signInTitle")}</Text>
        </View>

        <View style={styles.buttons}>
          {Platform.OS === "ios" ? (
            <AppleAuthentication.AppleAuthenticationButton
              testID="apple-sign-in-button"
              buttonType={
                AppleAuthentication.AppleAuthenticationButtonType.CONTINUE
              }
              buttonStyle={
                colorScheme === "dark"
                  ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                  : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
              }
              cornerRadius={theme.radius.md}
              style={[
                styles.appleButton,
                pending !== null && styles.buttonDisabled,
              ]}
              pointerEvents={pending !== null ? "none" : "auto"}
              onPress={() => void handleOAuth("apple")}
            />
          ) : (
            <Pressable
              style={({ pressed }) => [
                styles.appleFallbackButton,
                pending !== null && styles.buttonDisabled,
                pressed && styles.buttonPressed,
              ]}
              onPress={() => void handleOAuth("apple")}
              disabled={pending !== null}
            >
              <Text style={styles.appleFallbackButtonText}>
                {t("account.apple")}
              </Text>
            </Pressable>
          )}
          <Pressable
            style={({ pressed }) => [
              styles.googleButton,
              pending !== null && styles.buttonDisabled,
              pressed && styles.buttonPressed,
            ]}
            onPress={() => void handleOAuth("google")}
            disabled={pending !== null}
          >
            <Text style={styles.googleButtonText}>{t("account.google")}</Text>
          </Pressable>
          {anonEnabled && (
            <Pressable
              testID="dev-login-button"
              style={({ pressed }) => [
                styles.devButton,
                pending !== null && styles.buttonDisabled,
                pressed && styles.buttonPressed,
              ]}
              onPress={() => void handleOAuth("anonymous")}
              disabled={pending !== null}
            >
              <Text style={styles.devButtonText}>{t("account.anonymous")}</Text>
            </Pressable>
          )}
        </View>
      </View>

      <Text style={styles.terms}>
        {t("legal.consent", {
          terms: "\uE000",
          privacy: "\uE001",
        })
          .split(/(\uE000|\uE001)/)
          .map((part, index) => {
            if (part !== "\uE000" && part !== "\uE001") return part;
            const isTerms = part === "\uE000";
            return (
              <Text
                key={index}
                style={styles.termsLink}
                onPress={() =>
                  void Linking.openURL(
                    isTerms ? LEGAL_URLS.terms : LEGAL_URLS.privacy,
                  )
                }
              >
                {t(isTerms ? "legal.termsShort" : "legal.privacy")}
              </Text>
            );
          })}
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
    alignItems: "center",
  },
  back: {
    position: "absolute",
    top: rt.insets.top + theme.gap(1),
    left: theme.gap(2),
    padding: theme.gap(1),
    zIndex: 1,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "stretch",
    gap: theme.gap(8),
  },
  header: {
    alignItems: "center",
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
    alignSelf: "stretch",
    gap: theme.gap(2),
  },
  appleButton: {
    alignSelf: "stretch",
    height: 52,
  },
  appleFallbackButton: {
    minHeight: 52,
    backgroundColor: theme.colors.foreground,
    borderWidth: 1,
    borderColor: theme.colors.foreground,
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  appleFallbackButtonText: {
    color: theme.colors.background,
    fontFamily: theme.fonts.bold,
    fontSize: 16,
  },
  googleButton: {
    minHeight: 52,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  googleButtonText: {
    color: theme.colors.foreground,
    fontFamily: theme.fonts.bold,
    fontSize: 16,
  },
  devButton: {
    backgroundColor: "transparent",
    paddingVertical: theme.gap(1.25),
    alignItems: "center",
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
    textAlign: "center",
    paddingHorizontal: theme.gap(4),
    marginBottom: theme.gap(2),
  },
  termsLink: {
    fontFamily: theme.fonts.medium,
    color: theme.colors.muted,
    textDecorationLine: "underline",
  },
  error: {
    marginTop: theme.gap(2),
    paddingHorizontal: theme.gap(2),
    fontFamily: theme.fonts.regular,
    color: theme.colors.danger,
    fontSize: 12,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonPressed: {
    opacity: 0.7,
  },
}));
