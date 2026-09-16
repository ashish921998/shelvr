import { t, useAppLocale } from "@/lib/i18n";
import { LEGAL_URLS } from "@/lib/legal";
import { useOAuthSignIn } from "@/lib/oauth-sign-in";
import { WelcomeGlass } from "@/components/welcome-glass";
import { Wordmark } from "@/components/wordmark";
import * as AppleAuthentication from "expo-apple-authentication";
import * as React from "react";
import {
  Linking,
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Text,
  useColorScheme,
  useWindowDimensions,
  View,
} from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { SafeAreaView } from "react-native-safe-area-context";

/**
 * Convex Auth OAuth sign-in (React Native). The flow lives in
 * `lib/oauth-sign-in.ts` (shared with the onboarding demo's inline sign-in);
 * this screen is its full-page presentation. Google and Apple are configured
 * on the backend (convex/auth.ts). The "Dev login" button is only shown when
 * Anonymous is enabled on the deployment (AUTH_ENABLE_ANONYMOUS=true).
 */
export default function Page() {
  useAppLocale();
  const {
    signInWith: handleOAuth,
    pendingProvider: pending,
    lastError,
  } = useOAuthSignIn();
  const colorScheme = useColorScheme();
  const { width, height } = useWindowDimensions();

  const anonEnabled =
    __DEV__ && process.env.EXPO_PUBLIC_AUTH_ENABLE_ANONYMOUS === "true";

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.container}
      >
        <View style={styles.center}>
          <View style={styles.art}>
            <WelcomeGlass width={Math.min(width - 40, height * 0.38, 400)} />
          </View>
          <View style={styles.header}>
            <Wordmark size={52} />
            <Text style={styles.subtitle}>{t("brand.tagline")}</Text>
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
                cornerRadius={28}
                style={[
                  styles.appleButton,
                  pending !== null && styles.buttonDisabled,
                ]}
                pointerEvents={pending !== null ? "none" : "auto"}
                onPress={() => handleOAuth("apple")}
              />
            ) : (
              <Pressable
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.appleFallbackButton,
                  pending !== null && styles.buttonDisabled,
                  pressed && styles.buttonPressed,
                ]}
                onPress={() => handleOAuth("apple")}
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
              onPress={() => handleOAuth("google")}
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
                onPress={() => handleOAuth("anonymous")}
                disabled={pending !== null}
              >
                <Text style={styles.devButtonText}>
                  {t("account.anonymous")}
                </Text>
              </Pressable>
            )}
          </View>
          {pending !== null && (
            <View style={styles.pending} accessibilityLiveRegion="polite">
              <ActivityIndicator
                color={colorScheme === "dark" ? "#f4eddd" : "#2b2418"}
              />
              <Text style={styles.pendingText}>{t("account.signingIn")}</Text>
            </View>
          )}
          {lastError !== null && (
            <Text accessibilityRole="alert" selectable style={styles.error}>
              {lastError}
            </Text>
          )}
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
      </ScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create((theme) => ({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  container: {
    flexGrow: 1,
    backgroundColor: theme.colors.background,
    padding: theme.gap(2.5),
    paddingTop: theme.gap(2),
    paddingBottom: theme.gap(2),
    alignItems: "center",
  },
  center: {
    flex: 1,
    justifyContent: "flex-start",
    alignItems: "center",
    gap: theme.gap(2),
    maxWidth: 440,
    width: "100%",
    alignSelf: "center",
  },
  art: {
    alignItems: "center",
    marginBottom: -24,
  },
  header: {
    alignItems: "center",
    gap: theme.gap(1),
  },
  subtitle: {
    fontFamily: theme.fonts.regular,
    fontSize: 24,
    lineHeight: 32,
    textAlign: "center",
    color: theme.colors.foreground,
  },
  buttons: {
    alignSelf: "stretch",
    gap: theme.gap(1.5),
    marginTop: "auto",
    paddingTop: theme.gap(3),
    paddingBottom: theme.gap(2),
  },
  appleButton: {
    alignSelf: "stretch",
    height: 52,
  },
  appleFallbackButton: {
    backgroundColor: theme.colors.foreground,
    paddingVertical: theme.gap(2),
    borderRadius: 28,
    borderCurve: "continuous",
    minHeight: 52,
    alignItems: "center",
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
    borderRadius: 28,
    borderCurve: "continuous",
    minHeight: 52,
    alignItems: "center",
  },
  googleButtonText: {
    color: theme.colors.foreground,
    fontFamily: theme.fonts.medium,
    fontSize: 16,
  },
  devButton: {
    minHeight: 44,
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
    color: theme.colors.foreground,
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
    marginTop: 16,
    paddingHorizontal: 16,
    color: theme.colors.danger,
    fontSize: 12,
  },
  pending: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    paddingBottom: 16,
  },
  pendingText: {
    color: theme.colors.foreground,
    fontFamily: theme.fonts.regular,
    fontSize: 14,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonPressed: {
    opacity: 0.7,
  },
}));
