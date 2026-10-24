import { isAnonymousAuthEnabled } from "@/lib/anonymous-auth";
import { t, useAppLocale } from "@/lib/i18n";
import { LEGAL_URLS } from "@/lib/legal";
import { useOAuthSignIn, type OAuthProvider } from "@/lib/oauth-sign-in";
import { SignInHero } from "@/components/sign-in-hero";
import { useLargeText } from "@/lib/use-large-text";
import { AppSymbolIcon } from "@/components/symbol";
import * as AppleAuthentication from "expo-apple-authentication";
import {
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  useColorScheme,
  View,
} from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

export function SignInView({
  onCompleted,
  onBack,
}: {
  onCompleted?: () => void;
  onBack?: () => void;
}) {
  useAppLocale();
  const {
    signInWith,
    pendingProvider: pending,
    lastError,
    interrupted,
  } = useOAuthSignIn("sign_in_view");
  const colorScheme = useColorScheme();
  // At large text sizes the buttons and the consent text need the room.
  const showHero = !useLargeText();
  const { theme } = useUnistyles();

  const handleOAuth = async (provider: OAuthProvider) => {
    if ((await signInWith(provider)) === "completed") onCompleted?.();
  };

  const anonEnabled = isAnonymousAuthEnabled();

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      alwaysBounceVertical={false}
    >
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
      {showHero ? <SignInHero /> : null}
      <View style={styles.center}>
        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">
            shelvr
          </Text>
          <Text style={styles.tagline}>{t("opener.tagline")}</Text>
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
              cornerRadius={26}
              style={[
                styles.appleButton,
                pending !== null && styles.buttonDisabled,
              ]}
              pointerEvents={pending !== null ? "none" : "auto"}
              onPress={() => void handleOAuth("apple")}
            />
          ) : (
            <Pressable
              accessibilityRole="button"
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
            accessibilityRole="button"
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
              accessibilityRole="button"
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

      <Text style={styles.terms}>{t("aiConsent.signInNote")}</Text>
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
                accessibilityRole="link"
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
      {pending === null && interrupted && (
        <Text style={styles.error}>{t("account.signInNotFinished")}</Text>
      )}
    </ScrollView>
  );
}
const styles = StyleSheet.create((theme, rt) => ({
  scroll: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  container: {
    flexGrow: 1,
    padding: theme.gap(2.5),
    paddingTop: rt.insets.top + theme.gap(2),
    paddingBottom: rt.insets.bottom + theme.gap(1),
    alignItems: "stretch",
    gap: theme.gap(2),
  },
  back: {
    position: "absolute",
    top: rt.insets.top + theme.gap(1),
    left: theme.gap(2),
    padding: theme.gap(1),
    zIndex: 1,
  },
  center: {
    alignSelf: "stretch",
    gap: theme.gap(2.5),
  },
  header: {
    gap: theme.gap(0.75),
    alignItems: "center",
  },
  title: {
    fontFamily: theme.fonts.display,
    fontSize: 32,
    lineHeight: 36,
    color: theme.colors.primaryText,
  },
  tagline: {
    fontFamily: theme.fonts.display,
    fontSize: 30,
    lineHeight: 34,
    textAlign: "center",
    color: theme.colors.foreground,
  },
  subtitle: {
    ...theme.type.subhead,
    textAlign: "center",
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
    borderRadius: 999,
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
    borderRadius: 999,
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
    paddingHorizontal: theme.gap(2),
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
